import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const state = vi.hoisted(() => ({ headers: new Headers(), userId: "u1" as string | null, redirected: null as string | null, limited: false }));

vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirected = to;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/server/session", () => ({
  requireUserId: async () => {
    if (!state.userId) throw new (await import("@/lib/errors")).AppError("UNAUTHENTICATED", "Please sign in to continue");
    return state.userId;
  },
}));
vi.mock("@/server/rate-limit", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    LIMITS: { mutate: { max: 120, windowSeconds: 60 } },
    limit: async () => {
      if (state.limited) throw new AppError("RATE_LIMITED", "Too many requests.");
    },
  };
});

import { env } from "@/lib/env";
import { assertSameOrigin, userOrLogin } from "@/server/action-user";

const ORIGIN = new URL(env.BETTER_AUTH_URL).origin;
const h = (o: Record<string, string>) => new Headers(o);

beforeEach(() => {
  state.headers = h({ origin: ORIGIN });
  state.userId = "u1";
  state.redirected = null;
  state.limited = false;
});

describe("assertSameOrigin", () => {
  it("accepts the app's own origin", () => expect(() => assertSameOrigin(h({ origin: ORIGIN }))).not.toThrow());
  it.each(["http://evil.example", "null", ORIGIN + ".evil.example", "https://" + new URL(ORIGIN).host + ".attacker.test"])("rejects Origin %s", (o) => {
    expect(() => assertSameOrigin(h({ origin: o }))).toThrow(AppError);
  });
  it("rejects a request with neither Origin nor a same-origin fetch-metadata header", () => {
    expect(() => assertSameOrigin(h({}))).toThrow(AppError);
    expect(() => assertSameOrigin(h({ "sec-fetch-site": "cross-site" }))).toThrow(AppError);
    expect(() => assertSameOrigin(h({ "sec-fetch-site": "same-site" }))).toThrow(AppError);
  });
  it("accepts a browser that omits Origin but reports same-origin", () => {
    expect(() => assertSameOrigin(h({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("an explicit wrong Origin wins over a claimed same-origin header", () => {
    expect(() => assertSameOrigin(h({ origin: "http://evil.example", "sec-fetch-site": "same-origin" }))).toThrow(AppError);
  });
});

describe("userOrLogin", () => {
  it("returns the user id for a same-origin signed-in request", async () => {
    await expect(userOrLogin()).resolves.toBe("u1");
  });
  it("refuses a forged origin before it even looks at the session", async () => {
    state.headers = h({ origin: "http://evil.example" });
    state.userId = null;
    await expect(userOrLogin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.redirected).toBeNull();
  });
  it("sends signed-out users to /login", async () => {
    state.userId = null;
    await expect(userOrLogin()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirected).toBe("/login");
  });
  it("surfaces the rate limit", async () => {
    state.limited = true;
    await expect(userOrLogin()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
