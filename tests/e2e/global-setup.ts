import { execSync } from "node:child_process";
import postgres from "postgres";
import { DATABASE_URL, SERVER_ENV } from "./env";

/** Brings the e2e database to the current schema and loads the default categories. Safe to run every time. */
export default async function globalSetup() {
  const env = { ...process.env, ...SERVER_ENV, DATABASE_URL };
  execSync("npx drizzle-kit migrate", { env, stdio: "pipe" });
  execSync("npx tsx --conditions react-server src/db/seed.ts", { env, stdio: "pipe" });
  // Forget rate-limit windows left over from a previous run.
  const db = postgres(DATABASE_URL, { max: 1 });
  await db`delete from rate_limit`;
  await db`delete from app_rate_limit`;
  await db.end();
}
