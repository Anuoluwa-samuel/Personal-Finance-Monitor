import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

/**
 * Cross-user access returns NOT_FOUND rather than FORBIDDEN so ids of other
 * users' records cannot be probed.
 */
export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);

export type ErrorBody = {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
};

/** Converts any thrown value to a safe response body. Unknown errors are logged without detail leaking out. */
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, fields: err.fields } },
    };
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return {
      status: 400,
      body: { error: { code: "VALIDATION", message: "Some fields are invalid", fields } },
    };
  }
  console.error("Unhandled error:", err instanceof Error ? err.name : typeof err);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
  };
}
