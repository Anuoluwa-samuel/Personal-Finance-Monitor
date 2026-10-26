import { env } from "@/lib/env";

/** Bump when either document changes in a way users should know about. */
export const LEGAL_EFFECTIVE_DATE = "26 October 2026";

export function legalDetails() {
  return {
    operator: env.LEGAL_OPERATOR_NAME ?? null,
    email: env.LEGAL_CONTACT_EMAIL ?? null,
    jurisdiction: env.LEGAL_JURISDICTION ?? null,
  };
}
