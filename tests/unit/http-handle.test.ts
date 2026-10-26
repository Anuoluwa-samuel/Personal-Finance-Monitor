import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const session = vi.hoisted(() => ({ userId: "u1" as string | null }));
const limiter = vi.hoisted(() => ({ block: false }));

vi.mock("@/server/session", () => ({
  requireUserId: async () => {
    if (!session.userId) throw new (await import("@/lib/errors")).AppError("UNAUTHENTICATED", "Please sign in to continue");
    return session.userId;
  },
}));
vi.mock("@/server/rate-limit", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    LIMITS: { mutate: { max: 120, windowSeconds: 60 } },
    limit: async () => {
      if (limiter.block) throw new AppError("RATE_LIMITED", "Too many requests. Please wait 30 seconds and try again.");
    },
  };
});

import { env } from "@/lib/env";
import { handle, json, readJson } from "@/server/http";

const ORIGIN = new URL(env.BETTER_AUTH_URL).origin;
const req = (init: RequestInit & { headers?: Record<string, string> } = {}) => new Request("http://localhost/api/x", { method: "POST", ...init });
const ok = async () => json({ ok: true });

beforeEach(() => {
  session.userId = "u1";
  limiter.block = false;
});

describe("handle(): CSRF defence for cookie-authenticated writes", () => {
  it("rejects a write with no Origin header", async () => {
    expect((await handle(req(), ok, { mutating: true })).status).toBe(403);
  });
  it.each(["http://evil.example", "http://localhost:3000.evil.example", "null", "https://" + new URL(ORIGIN).host])("rejects Origin %s", async (origin) => {
    const bad = origin === ORIGIN ? "http://other.example" : origin;
    expect((await handle(req({ headers: { origin: bad } }), ok, { mutating: true })).status).toBe(403);
  });
  it("accepts a write from the app's own origin", async () => {
    expect((await handle(req({ headers: { origin: ORIGIN } }), ok, { mutating: true })).status).toBe(200);
  });
  it("does not demand Origin for reads", async () => {
    expect((await handle(req({ method: "GET" }), ok, { mutating: false })).status).toBe(200);
  });
  it("checks the origin before anything else, so an attacker learns nothing about the session", async () => {
    session.userId = null;
    expect((await handle(req({ headers: { origin: "http://evil.example" } }), ok, { mutating: true })).status).toBe(403);
  });
});

describe("handle(): authentication, limits and error hygiene", () => {
  it("returns 401 without a session", async () => {
    session.userId = null;
    const res = await handle(req({ method: "GET" }), ok, { mutating: false });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
  it("returns 429 when the rate limit is hit, for writes only", async () => {
    limiter.block = true;
    expect((await handle(req({ headers: { origin: ORIGIN } }), ok, { mutating: true })).status).toBe(429);
    expect((await handle(req({ method: "GET" }), ok, { mutating: false })).status).toBe(200);
  });
  it("maps AppErrors to their status with a safe body", async () => {
    const res = await handle(req({ method: "GET" }), async () => { throw new AppError("NOT_FOUND", "Transaction not found"); }, { mutating: false });
    expect(res.status).toBe(404);
  });
  it("never leaks internals of unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(req({ method: "GET" }), async () => { throw new Error('relation "transactions" does not exist at /srv/app/db.ts:42'); }, { mutating: false });
    const text = await res.text();
    expect(res.status).toBe(500);
    for (const secret of ["relation", "transactions", "/srv/app", "db.ts"]) expect(text).not.toContain(secret);
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0])).not.toContain("relation");
    spy.mockRestore();
  });
  it("marks every response private and uncacheable", async () => {
    for (const res of [await handle(req({ method: "GET" }), ok, { mutating: false }), await handle(req(), ok, { mutating: true })]) {
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

describe("readJson(): bounded, strict parsing", () => {
  const body = (text: string, extra: Record<string, string> = {}) => req({ body: text, headers: { "content-type": "application/json", ...extra } });
  it("parses valid JSON", async () => expect(await readJson(body('{"a":1}'))).toEqual({ a: 1 }));
  it("rejects malformed JSON with a 400-class error", async () => {
    await expect(readJson(body("{nope"))).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("rejects bodies over 16 KB, by declared length and by actual size", async () => {
    await expect(readJson(body("x".repeat(20_000), { "content-length": "20000" }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(readJson(body(JSON.stringify({ x: "a".repeat(17_000) })))).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("rejects an empty body", async () => {
    await expect(readJson(body(""))).rejects.toThrow();
  });
});
