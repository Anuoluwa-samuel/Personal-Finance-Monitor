/** Settings for the end-to-end server. A throwaway database and throwaway secrets: nothing here is sensitive. */
export const E2E_PORT = 3199;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const DATABASE_URL = "postgres://ispentit:ispentit@localhost:54340/ispentit_e2e";
export const BETTER_AUTH_SECRET = "e2e-only-secret-e2e-only-secret-0123456789";
export const CRON_SECRET = "e2e-only-cron-secret-0123456789";
export const PASSWORD = "correct-horse-battery";

export const SERVER_ENV = {
  DATABASE_URL,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: BASE_URL,
  EMAIL_FROM: "Ispentit <no-reply@localhost>",
  CRON_SECRET,
  LEGAL_OPERATOR_NAME: "E2E Operator",
  LEGAL_CONTACT_EMAIL: "legal@example.test",
  LEGAL_JURISDICTION: "Nowhere",
};
