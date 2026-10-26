import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { hit, limit } from "@/server/rate-limit";

const key = () => `test:${randomUUID()}`;

describe("rate limiter", () => {
  it("allows up to max hits in a window, then blocks with a retry time", async () => {
    const k = key();
    const t = 1_000_000;
    for (let i = 1; i <= 3; i++) expect((await hit(k, 3, 60, t + i)).allowed).toBe(true);
    const blocked = await hit(k, 3, 60, t + 10);
    expect(blocked).toMatchObject({ allowed: false, count: 4 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const k = key();
    const t = 5_000_000;
    await hit(k, 1, 60, t);
    expect((await hit(k, 1, 60, t + 1000)).allowed).toBe(false);
    expect(await hit(k, 1, 60, t + 61_000)).toMatchObject({ allowed: true, count: 1 });
  });

  it("is atomic: concurrent requests cannot exceed the limit", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 25 }, () => hit(k, 10, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(Math.max(...results.map((r) => r.count))).toBe(25);
  });

  it("keeps keys independent", async () => {
    const a = key();
    const b = key();
    await hit(a, 1, 60);
    expect((await hit(a, 1, 60)).allowed).toBe(false);
    expect((await hit(b, 1, 60)).allowed).toBe(true);
  });

  it("limit() throws a 429 AppError with a friendly message", async () => {
    const k = key();
    await limit(k, 1, 60);
    const err = await limit(k, 1, 60).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(err.message).toMatch(/Please wait \d+ seconds/);
  });
});
