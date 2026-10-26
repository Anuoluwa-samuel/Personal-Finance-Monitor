import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().url(),
    EMAIL_FROM: z.string().min(3),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Shared secret for the scheduled job endpoint. Without it the endpoint refuses every request.
    CRON_SECRET: z.string().min(16).optional(),
    // Shown in the Terms and Privacy Policy. Left unset, the pages say the details are not configured rather than inventing any.
    LEGAL_OPERATOR_NAME: z.string().min(2).max(120).optional(),
    LEGAL_CONTACT_EMAIL: z.string().email().optional(),
    LEGAL_JURISDICTION: z.string().min(2).max(120).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    LEGAL_OPERATOR_NAME: process.env.LEGAL_OPERATOR_NAME || undefined,
    LEGAL_CONTACT_EMAIL: process.env.LEGAL_CONTACT_EMAIL || undefined,
    LEGAL_JURISDICTION: process.env.LEGAL_JURISDICTION || undefined,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  emptyStringAsUndefined: true,
});
