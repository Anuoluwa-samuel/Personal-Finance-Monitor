import { randomUUID } from "node:crypto";
import { createEmailVerificationToken } from "better-auth/api";
import { expect, test as base, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { BASE_URL, BETTER_AUTH_SECRET, DATABASE_URL, PASSWORD } from "./env";

export const uniqueEmail = (tag = "user") => `${tag}-${randomUUID().slice(0, 8)}@e2e.test`;

/** A direct connection for setting up large datasets that would take too long to click through. */
export const sql = postgres(DATABASE_URL, { max: 2 });

/**
 * Completes email verification through the app's real /verify-email endpoint. The mail provider is not configured in
 * this environment, so instead of reading an inbox we mint the same signed token the verification email would carry.
 */
export async function verificationUrl(email: string): Promise<string> {
  const token = await createEmailVerificationToken(BETTER_AUTH_SECRET, email, undefined, 3600);
  return `${BASE_URL}/api/auth/verify-email?token=${token}&callbackURL=/dashboard`;
}

export async function register(page: Page, name: string, email: string, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Registers, verifies and lands signed in on the dashboard. */
export async function newVerifiedUser(page: Page, tag = "user") {
  const email = uniqueEmail(tag);
  await register(page, `E2E ${tag}`, email);
  await page.goto(await verificationUrl(email));
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

export async function userIdOf(email: string): Promise<string> {
  const [row] = await sql`select id from "user" where email = ${email}`;
  return row.id as string;
}

/** For API-level tests: a request context that carries a verified user's session cookie. Returns the user's email. */
export async function apiSession(request: APIRequestContext, tag = "api") {
  const email = uniqueEmail(tag);
  const up = await request.post("/api/auth/sign-up/email", { data: { name: "API user", email, password: PASSWORD }, headers: { origin: BASE_URL } });
  expect(up.ok()).toBeTruthy();
  expect((await request.get(await verificationUrl(email))).ok()).toBeTruthy();
  const signedIn = await request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD }, headers: { origin: BASE_URL } });
  expect(signedIn.ok()).toBeTruthy();
  return email;
}

export const categoryId = async (name: string, type: "income" | "expense") => {
  const [row] = await sql`select id from category where user_id is null and name = ${name} and type = ${type}`;
  return row.id as string;
};

/** Text of a dashboard summary card, e.g. stat(page, "Income") -> "Income₦250,000.50 1 entry…". */
export const stat = (page: Page, title: string) => page.getByRole("heading", { level: 3, name: title, exact: true }).locator("..");

/** The app's own alert messages (Next also renders a hidden route announcer with role="alert"). */
export const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

export { expect };

/** A fresh, unique client address, so tests behave like different people instead of one IP hitting the per-IP limits. */
export const randomIp = () => `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

export const contextOptions = () => ({
  baseURL: BASE_URL,
  timezoneId: "Africa/Lagos",
  locale: "en-GB",
  extraHTTPHeaders: { "x-forwarded-for": randomIp() },
});

export const newUserContext = (browser: Browser) => browser.newContext(contextOptions());

/** `test` whose built-in page/request fixtures each come from their own client address. */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-forwarded-for": randomIp() });
  },
});
