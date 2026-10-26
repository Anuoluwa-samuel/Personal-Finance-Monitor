import { randomUUID } from "node:crypto";
import { BASE_URL, CRON_SECRET } from "./env";
import { apiSession, categoryId, expect, test } from "./helpers";

const origin = { origin: BASE_URL };
const uuid = () => randomUUID();

test.describe("unauthenticated and cross-site requests", () => {
  test("private endpoints refuse anonymous callers", async ({ request }) => {
    for (const [method, path] of [["GET", "/api/transactions"], ["GET", "/api/transactions/export"], ["GET", `/api/transactions/${uuid()}`]] as const) {
      expect((await request.fetch(path, { method })).status(), `${method} ${path}`).toBe(401);
    }
    expect((await request.post("/api/transactions", { data: {}, headers: origin })).status()).toBe(401);
  });

  test("writes without an Origin, or from another origin, are refused before anything else", async ({ request }) => {
    await apiSession(request);
    expect((await request.post("/api/transactions", { data: {} })).status()).toBe(403);
    expect((await request.post("/api/transactions", { data: {}, headers: { origin: "http://evil.example" } })).status()).toBe(403);
    expect((await request.delete(`/api/transactions/${uuid()}`, { headers: { origin: "null" } })).status()).toBe(403);
  });

  test("responses are private, uncacheable and carry the security headers; there is no CORS", async ({ request }) => {
    await apiSession(request);
    const res = await request.get("/api/transactions", { headers: { origin: "http://evil.example" } });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
    expect((await request.fetch("/api/transactions", { method: "PUT", headers: origin })).status()).toBe(405);
  });
});

test.describe("malformed and hostile input to the transactions API", () => {
  test("is rejected with 400, clear field errors, and never a stack trace", async ({ request }) => {
    await apiSession(request);
    const food = await categoryId("Food and groceries", "expense");
    const salary = await categoryId("Salary", "income");
    const base = { kind: "expense", amount: "10.00", description: "x", categoryId: food, transactionDate: "2025-03-01" };
    const bad: [string, unknown, string?][] = [
      ["unknown field (client-supplied userId)", { ...base, userId: "someone-else" }],
      ["numeric amount (floats are never accepted)", { ...base, amount: 10.5 }, "amount"],
      ["zero amount", { ...base, amount: "0" }, "amount"],
      ["negative amount", { ...base, amount: "-5" }, "amount"],
      ["more than two decimals", { ...base, amount: "1.005" }, "amount"],
      ["exponent notation", { ...base, amount: "1e9" }, "amount"],
      ["absurdly large amount", { ...base, amount: "9".repeat(20) }, "amount"],
      ["impossible date", { ...base, transactionDate: "2025-02-30" }, "transactionDate"],
      ["date out of range", { ...base, transactionDate: "1850-01-01" }, "transactionDate"],
      ["blank description", { ...base, description: "   " }, "description"],
      ["overlong description", { ...base, description: "x".repeat(201) }, "description"],
      ["category of the wrong type", { ...base, categoryId: salary }, "categoryId"],
      ["category that does not exist", { ...base, categoryId: uuid() }, "categoryId"],
      ["category id that is not a uuid", { ...base, categoryId: "'; drop table transactions;--" }, "categoryId"],
      ["bad kind", { ...base, kind: "transfer" }, "kind"],
    ];
    for (const [label, data, field] of bad) {
      const res = await request.post("/api/transactions", { data, headers: origin });
      const text = await res.text();
      expect(res.status(), label).toBe(400);
      expect(text, label).not.toMatch(/at \/|node_modules|postgres|syntax error|relation "/i);
      if (field) expect(JSON.parse(text).error.fields, label).toHaveProperty(field);
    }
    expect((await request.post("/api/transactions", { data: "{not json", headers: { ...origin, "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/transactions", { data: JSON.stringify({ x: "a".repeat(20_000) }), headers: { ...origin, "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.get("/api/transactions?pageSize=101")).status()).toBe(400);
    expect((await request.get("/api/transactions?sort=password")).status()).toBe(400);
    expect((await request.get("/api/transactions?q=" + "a".repeat(500))).status()).toBe(400);
    expect((await request.get("/api/transactions/not-a-uuid")).status()).toBe(400);
    expect((await request.get(`/api/transactions/${uuid()}`)).status()).toBe(404);
  });

  test("a SQL-looking search is just text", async ({ request }) => {
    await apiSession(request);
    const res = await request.get("/api/transactions?q=" + encodeURIComponent("' OR 1=1; --"));
    expect(res.status()).toBe(200);
    expect((await res.json()).total).toBe(0);
  });
});

test.describe("duplicate submissions", () => {
  test("the same idempotency key creates one transaction; a different payload with it is a conflict", async ({ request }) => {
    await apiSession(request);
    const food = await categoryId("Food and groceries", "expense");
    const body = { kind: "expense", amount: "99.99", description: "double click", categoryId: food, transactionDate: "2025-03-01", idempotencyKey: "e2e-" + uuid() };
    const first = await request.post("/api/transactions", { data: body, headers: origin });
    const retry = await request.post("/api/transactions", { data: body, headers: origin });
    expect(first.status()).toBe(201);
    expect((await retry.json()).id).toBe((await first.json()).id);
    expect((await (await request.get("/api/transactions")).json()).total).toBe(1);
    expect((await request.post("/api/transactions", { data: { ...body, amount: "1.00" }, headers: origin })).status()).toBe(409);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => request.post("/api/transactions", { data: { ...body, idempotencyKey: "e2e-par-" + body.idempotencyKey.slice(4), description: "parallel" }, headers: origin })));
    expect(new Set(await Promise.all(parallel.filter((r) => r.ok()).map(async (r) => (await r.json()).id))).size).toBe(1);
  });
});

test.describe("abuse limits", () => {
  test("a user who hammers write endpoints is rate limited (429) while reads keep working", async ({ request }) => {
    await apiSession(request);
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await request.delete(`/api/transactions/${uuid()}`, { headers: origin })).status());
    expect(statuses.slice(0, 120).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(120).every((s) => s === 429)).toBe(true);
    expect((await request.get("/api/transactions")).status()).toBe(200);
  });

  test("CSV export is limited to 5 per minute per user", async ({ request }) => {
    await apiSession(request);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request.get("/api/transactions/export")).status());
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });

  test("a single address cannot be brute-forced: the 11th wrong password for one email is refused even from new IPs", async ({ playwright }) => {
    const email = `victim-${uuid().slice(0, 8)}@e2e.test`;
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const ctx = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-forwarded-for": `10.9.${i}.1` } });
      codes.push((await ctx.post("/api/auth/sign-in/email", { data: { email, password: "wrong-password-1" }, headers: origin })).status());
      await ctx.dispose();
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});

test.describe("operational endpoints", () => {
  test("health reports only ok, nothing about the system", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("the scheduled job needs the secret", async ({ request }) => {
    expect((await request.get("/api/cron/recurring")).status()).toBe(401);
    expect((await request.get("/api/cron/recurring", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/recurring", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });

  test("external callback URLs are rejected (no open redirect)", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", { data: { email: "a@e2e.test", password: "x-wrong-password", callbackURL: "https://evil.example/steal" }, headers: origin });
    expect(res.status()).toBe(403);
    expect((await request.get("/api/auth/verify-email?token=bogus&callbackURL=https://evil.example/x", { maxRedirects: 0 })).headers()["location"] ?? "").not.toContain("evil.example");
  });
});
