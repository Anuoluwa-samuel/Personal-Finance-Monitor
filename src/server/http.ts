import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AppError, toErrorResponse } from "@/lib/errors";
import { LIMITS, limit } from "./rate-limit";
import { requireUserId } from "./session";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/**
 * CSRF defence for cookie-authenticated writes: browsers always send Origin on
 * cross-site POST/PATCH/DELETE, so anything that is not our own origin is rejected.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== new URL(env.BETTER_AUTH_URL).origin) {
    throw new AppError("FORBIDDEN", "Cross-origin request rejected");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request body is too large");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON");
  }
}

/** Wraps a handler: authenticates, checks origin on writes, and converts every failure into a safe response. */
export async function handle(
  req: Request,
  fn: (userId: string) => Promise<Response>,
  opts: { mutating: boolean },
): Promise<Response> {
  try {
    if (opts.mutating) assertSameOrigin(req);
    const userId = await requireUserId();
    if (opts.mutating) await limit(`api:${userId}:mutate`, LIMITS.mutate.max, LIMITS.mutate.windowSeconds);
    return await fn(userId);
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return json(body, status);
  }
}
