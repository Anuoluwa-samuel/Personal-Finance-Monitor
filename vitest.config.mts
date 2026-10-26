import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const envFile = path.resolve(import.meta.dirname, ".env.local");
const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const env = { ...fromFile, ...process.env } as Record<string, string | undefined>;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    globalSetup: ["tests/support/global-setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/components/**/*.test.tsx"],
    // Integration tests run only against the dedicated test database.
    env: { ...fromFile, DATABASE_URL: env.TEST_DATABASE_URL ?? "" },
    fileParallelism: false,
  },
});
