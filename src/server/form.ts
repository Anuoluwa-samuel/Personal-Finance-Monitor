import { toErrorResponse } from "@/lib/errors";

/** State returned by Server Actions to forms: a message, per-field errors, and the values to refill. */
export type FormState = {
  /** True when `message` reports success rather than an error. */
  ok?: boolean;
  message?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
} | null;

/** Converts any thrown error to form state without leaking internals. Re-throws framework control-flow errors (redirect/notFound). */
export function failure(err: unknown, values: Record<string, string>): FormState {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
  const { body } = toErrorResponse(err);
  return { message: body.error.message, fields: body.error.fields, values };
}

export const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
