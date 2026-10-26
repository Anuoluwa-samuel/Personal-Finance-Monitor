import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { LIMITS, limit } from "./rate-limit";
import { requireUserId } from "./session";

/**
 * Defence in depth against cross-site request forgery for Server Actions (the session cookie is already SameSite=Lax,
 * and Next rejects a mismatching Origin). Browsers always send Origin on form POSTs, so a request with NO Origin is
 * accepted only if the browser says it is same-origin (Sec-Fetch-Site); anything else, such as a script or a bare curl, is refused.
 */
export function assertSameOrigin(h: Headers, appUrl: string = env.BETTER_AUTH_URL): void {
  const origin = h.get("origin");
  if (origin !== null) {
    if (origin !== new URL(appUrl).origin) throw new AppError("FORBIDDEN", "Cross-origin request rejected");
    return;
  }
  if (h.get("sec-fetch-site") !== "same-origin") throw new AppError("FORBIDDEN", "Cross-origin request rejected");
}

/**
 * The one way a Server Action learns who is calling. It checks the request origin, verifies the session (sending
 * signed-out users to /login) and applies a per-user rate limit. Every exported Server Action must call it;
 * tests/unit/auth-coverage enforces that.
 */
export async function userOrLogin(opts: { name?: string; max?: number; windowSeconds?: number } = {}): Promise<string> {
  assertSameOrigin(await headers());
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") redirect("/login");
    throw e;
  }
  const { name = "mutate", max = LIMITS.mutate.max, windowSeconds = LIMITS.mutate.windowSeconds } = opts;
  await limit(`act:${userId}:${name}`, max, windowSeconds);
  return userId;
}
