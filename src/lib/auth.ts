import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { hit } from "@/server/rate-limit";

const isProd = process.env.NODE_ENV === "production";

const EMAIL_LIMITS: Record<string, { name: string; max: number; windowSeconds: number }> = {
  "/sign-in/email": { name: "signin", max: 10, windowSeconds: 15 * 60 },
  "/sign-up/email": { name: "signup", max: 5, windowSeconds: 60 * 60 },
  "/request-password-reset": { name: "reset", max: 3, windowSeconds: 60 * 60 },
  "/send-verification-email": { name: "verify", max: 3, windowSeconds: 60 * 60 },
};

export const auth = betterAuth({
  appName: "Ispentit",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited so response time does not reveal whether the email exists.
      void sendMail({
        to: user.email,
        subject: "Reset your Ispentit password",
        text: `Use this link within one hour to reset your password:\n${url}\n\nIf you did not ask for this, ignore this email.`,
      }).catch(() => console.error("password reset email failed"));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      void sendMail({
        to: user.email,
        subject: "Verify your Ispentit email",
        text: `Confirm your email within one hour:\n${url}`,
      }).catch(() => console.error("verification email failed"));
    },
  },

  // Second layer on top of the per-IP limits below: these are keyed by the submitted email address, so spreading
  // attempts over many IP addresses (or spoofing a forwarded-for header) still cannot hammer one account or
  // flood one inbox. The key uses the address whether or not an account exists, so it reveals nothing.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const rule = EMAIL_LIMITS[ctx.path];
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (!rule || typeof email !== "string") return;
      const r = await hit(`auth:${rule.name}:${email.trim().toLowerCase().slice(0, 150)}`, rule.max, rule.windowSeconds);
      if (!r.allowed) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Please wait and try again." });
    }),
  },

  user: { deleteUser: { enabled: true } },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  // Stored in Postgres so limits hold across serverless instances.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },

  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd },
  },

  // Must be last so Server Actions can set session cookies.
  plugins: [nextCookies()],
});
