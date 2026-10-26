import { defineConfig } from "@playwright/test";
import { BASE_URL, E2E_PORT, SERVER_ENV } from "./tests/e2e/env";

/**
 * End-to-end tests run against a PRODUCTION build (so the real CSP, cookies and caching are exercised) backed by an
 * isolated database named ispentit_e2e. Create it once:  createdb ispentit_e2e
 * Journeys that share state run serially in one worker; every test creates its own uniquely named users.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    timezoneId: "Africa/Lagos",
    locale: "en-GB",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run build && npx next start -p ${E2E_PORT}`,
    url: `${BASE_URL}/api/health`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { ...SERVER_ENV, NODE_ENV: "production" } as Record<string, string>,
  },
});
