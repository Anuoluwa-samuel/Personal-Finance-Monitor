import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

/** The per-email limits sit in front of the library's own per-IP limits, so changing IPs does not help an attacker. */
const attempt = (fn: () => Promise<unknown>): Promise<{ status: number; message?: string }> => fn().then(() => ({ status: 200 }), (e: { statusCode?: number; status?: number | string; body?: { message?: string } }) => ({ status: Number(e.statusCode ?? e.status), message: e.body?.message }));

afterAll(async () => {
  await db.delete(user).where(like(user.email, "known-%@example.test"));
});

describe("per-email authentication limits", () => {
  it("blocks the 11th sign-in attempt for one address, whether or not the account exists", async () => {
    const email = `nobody-${randomUUID()}@example.test`;
    const outcomes = [];
    for (let i = 0; i < 12; i++) {
      outcomes.push(await attempt(() => auth.api.signInEmail({ body: { email, password: "wrong-password-123" }, headers: new Headers({ "x-forwarded-for": `203.0.113.${i + 1}` }) })));
    }
    expect(outcomes.slice(0, 10).every((o) => o.status === 401)).toBe(true); // wrong password, same generic answer
    expect(outcomes[10].status).toBe(429);
    expect(outcomes[11].status).toBe(429);
  });

  it("treats addresses case-insensitively so changing capitals does not reset the count", async () => {
    const base = `Mixed-${randomUUID()}@Example.test`;
    for (let i = 0; i < 10; i++) await attempt(() => auth.api.signInEmail({ body: { email: i % 2 ? base.toLowerCase() : base, password: "wrong-password-123" } }));
    expect((await attempt(() => auth.api.signInEmail({ body: { email: base.toUpperCase(), password: "x-wrong-password" } }))).status).toBe(429);
  });

  it("limits password-reset requests per address to stop inbox flooding", async () => {
    const email = `flood-${randomUUID()}@example.test`;
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await attempt(() => auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })));
    expect(outcomes.slice(0, 3).every((o) => o.status === 200)).toBe(true); // same answer for an unknown address
    expect(outcomes[3].status).toBe(429);
  });

  it("returns the same answer for known and unknown addresses (no account enumeration)", async () => {
    const known = `known-${randomUUID()}@example.test`;
    await auth.api.signUpEmail({ body: { email: known, password: "correct-horse-battery", name: "Known" } });
    const a = await attempt(() => auth.api.signInEmail({ body: { email: known, password: "wrong-password-123" } }));
    const b = await attempt(() => auth.api.signInEmail({ body: { email: `unknown-${randomUUID()}@example.test`, password: "wrong-password-123" } }));
    // The known account is unverified, so the library may answer 403; what must not happen is a visible difference
    // for a WRONG password between a real and a made-up address.
    expect(a.status).toBe(b.status);
    expect(a.message).toBe(b.message);
    const reset1 = await attempt(() => auth.api.requestPasswordReset({ body: { email: known, redirectTo: "/reset-password" } }));
    const reset2 = await attempt(() => auth.api.requestPasswordReset({ body: { email: `ghost-${randomUUID()}@example.test`, redirectTo: "/reset-password" } }));
    expect(reset1.status).toBe(reset2.status);
  });
});
