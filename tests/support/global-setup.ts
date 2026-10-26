import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * Brings the integration-test database up to the current schema before any test runs, so a new contributor only has to
 * create an empty database named *_test. Refuses to touch any other database.
 */
export default function setup() {
  const file = ".env.local";
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const url = process.env.TEST_DATABASE_URL ?? fromFile.TEST_DATABASE_URL;
  if (!url) return; // unit and component tests do not need a database
  if (!new URL(url).pathname.endsWith("_test")) {
    // Printed and exited rather than thrown: vitest's stack-trace handling turns a thrown error here into an unreadable one.
    console.error("\nRefusing to run: TEST_DATABASE_URL must point at a database whose name ends in _test.\n");
    process.exit(1);
  }
  execSync("npx drizzle-kit migrate", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
