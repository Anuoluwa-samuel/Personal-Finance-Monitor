import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { recurringOccurrence, recurringRule, transactions, userPreferences } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { GET as cron } from "@/app/api/cron/recurring/route";
import { createAccount } from "@/server/accounts";
import { getDashboard } from "@/server/analytics";
import { getActiveBudgetForMonth } from "@/server/budgets";
import {
  countPending, createRule, deleteRule, generateOccurrences, listPending, listRules, pauseRule, postOccurrence, resumeRule, skipOccurrence, updateRule,
} from "@/server/recurring";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  users.push(u);
  return u;
};
async function code(p: Promise<unknown>) {
  const e = await p.then(() => null, (x) => x);
  return e instanceof AppError ? e.code : e instanceof Error ? `other:${e.name}` : null;
}
let rent: string;
let salary: string;
const D = (iso: string) => new Date(iso + "T12:00:00Z");
const rule = (u: string, over: Record<string, unknown> = {}) =>
  createRule(u, { kind: "expense", amount: "50000", description: "Rent", categoryId: rent, frequency: "monthly", intervalCount: 1, startDate: "2025-01-05", ...over } as never);
const txCount = async (u: string) => (await db.select().from(transactions).where(eq(transactions.userId, u))).length;

beforeAll(async () => {
  rent = await systemCategoryId("expense", "Housing");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(() => deleteTestUsers(users));

describe("generation", () => {
  it("creates planned occurrences only for dates that are due, and is idempotent", async () => {
    const u = await fresh();
    await rule(u);
    expect(await generateOccurrences({ userId: u, now: D("2025-03-10") })).toBe(3); // 5 Jan, 5 Feb, 5 Mar
    expect(await generateOccurrences({ userId: u, now: D("2025-03-10") })).toBe(0);
    expect((await listPending(u)).map((p) => p.scheduledFor)).toEqual(["2025-01-05", "2025-02-05", "2025-03-05"]);
    expect(await generateOccurrences({ userId: u, now: D("2025-04-05") })).toBe(1);
  });

  it("is safe when run concurrently", async () => {
    const u = await fresh();
    await rule(u);
    await Promise.all(Array.from({ length: 5 }, () => generateOccurrences({ userId: u, now: D("2025-03-10") })));
    expect(await db.select().from(recurringOccurrence).where(eq(recurringOccurrence.userId, u))).toHaveLength(3);
  });

  it("uses the user's timezone to decide what is due today", async () => {
    const u = await fresh();
    await rule(u, { startDate: "2025-04-01" });
    const edge = new Date("2025-03-31T23:30:00Z"); // already 1 April in Lagos
    await db.insert(userPreferences).values({ userId: u, timezone: "UTC" });
    expect(await generateOccurrences({ userId: u, now: edge })).toBe(0);
    await db.update(userPreferences).set({ timezone: "Africa/Lagos" }).where(eq(userPreferences.userId, u));
    expect(await generateOccurrences({ userId: u, now: edge })).toBe(1);
  });

  it("stops at the end date and never generates for paused rules", async () => {
    const u = await fresh();
    const a = await rule(u, { endDate: "2025-02-20", description: "Ends" });
    const b = await rule(u, { description: "Paused" });
    await pauseRule(u, b);
    await generateOccurrences({ userId: u, now: D("2025-12-31") });
    const pend = await listPending(u);
    expect(pend.filter((p) => p.description === "Ends").map((p) => p.scheduledFor)).toEqual(["2025-01-05", "2025-02-05"]);
    expect(pend.some((p) => p.description === "Paused")).toBe(false);
    expect((await listRules(u)).find((r) => r.id === a)?.nextDue).toBeNull();
  });

  it("resuming does not back-fill dates missed while paused", async () => {
    const u = await fresh();
    const id = await rule(u);
    await generateOccurrences({ userId: u, now: D("2025-01-10") });
    await pauseRule(u, id);
    await resumeRule(u, id, D("2025-04-20"));
    await generateOccurrences({ userId: u, now: D("2025-04-20") });
    expect((await listPending(u)).map((p) => p.scheduledFor)).toEqual(["2025-01-05"]); // Feb, Mar, Apr not created
    expect((await listRules(u))[0].nextDue).toBe("2025-05-05");
  });
});

describe("planned vs actual", () => {
  const NOW = D("2025-03-10");

  it("pending occurrences change no totals, balances or budgets until confirmed", async () => {
    const u = await fresh();
    await rule(u);
    const before = await getDashboard(u, {}, NOW);
    await generateOccurrences({ userId: u, now: NOW });
    expect(await countPending(u)).toBe(3);
    expect(await txCount(u)).toBe(0);
    const after = await getDashboard(u, {}, NOW);
    expect(after.totals).toEqual(before.totals);
    expect(after.recordedBalance).toBe(before.recordedBalance);
    expect(await getActiveBudgetForMonth(u, "2025-03-10")).toBeNull();
  });

  it("confirming creates exactly one transaction and is idempotent", async () => {
    const u = await fresh();
    await rule(u);
    await generateOccurrences({ userId: u, now: NOW });
    const [first] = await listPending(u);
    const t1 = await postOccurrence(u, first.id);
    const t2 = await postOccurrence(u, first.id);
    expect(t2).toBe(t1);
    expect(await txCount(u)).toBe(1);
    const [t] = await db.select().from(transactions).where(eq(transactions.id, t1));
    expect(t).toMatchObject({ kind: "expense", amount: "50000.0000", transactionDate: "2025-01-05", description: "Rent" });
    expect(await countPending(u)).toBe(2);
    expect((await getDashboard(u, { preset: "custom", from: "2025-01-01", to: "2025-01-31" }, NOW)).totals.expense).toBe("50000.00");
  });

  it("collapses concurrent confirmations to one transaction", async () => {
    const u = await fresh();
    await rule(u);
    await generateOccurrences({ userId: u, now: NOW });
    const [first] = await listPending(u);
    await Promise.allSettled(Array.from({ length: 4 }, () => postOccurrence(u, first.id)));
    expect(await txCount(u)).toBe(1);
  });

  it("lets the user adjust amount and date when confirming (variable bills)", async () => {
    const u = await fresh();
    await rule(u, { description: "Electricity", amount: "10000" });
    await generateOccurrences({ userId: u, now: NOW });
    const [first] = await listPending(u);
    const id = await postOccurrence(u, first.id, { amount: "12345.67", transactionDate: "2025-01-07" });
    const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
    expect(t).toMatchObject({ amount: "12345.6700", transactionDate: "2025-01-07" });
    const [second] = await listPending(u);
    await expect(postOccurrence(u, second.id, { amount: "0" })).rejects.toThrow();
    await expect(postOccurrence(u, second.id, { transactionDate: "2025-13-40" })).rejects.toThrow();
  });

  it("skipping creates nothing, and a skipped or posted occurrence cannot be flipped", async () => {
    const u = await fresh();
    await rule(u);
    await generateOccurrences({ userId: u, now: NOW });
    const [a, b] = await listPending(u);
    await skipOccurrence(u, a.id);
    await skipOccurrence(u, a.id); // idempotent
    expect(await code(postOccurrence(u, a.id))).toBe("CONFLICT");
    await postOccurrence(u, b.id);
    expect(await code(skipOccurrence(u, b.id))).toBe("CONFLICT");
    expect(await txCount(u)).toBe(1);
  });

  it("deleting a confirmed transaction leaves the occurrence record, and deleting the rule keeps real transactions", async () => {
    const u = await fresh();
    const id = await rule(u);
    await generateOccurrences({ userId: u, now: NOW });
    const [first] = await listPending(u);
    const tid = await postOccurrence(u, first.id);
    await db.delete(transactions).where(eq(transactions.id, tid));
    const [o] = await db.select().from(recurringOccurrence).where(eq(recurringOccurrence.id, first.id));
    expect(o).toMatchObject({ status: "posted", transactionId: null });
    const [second] = await listPending(u);
    await postOccurrence(u, second.id);
    await deleteRule(u, id);
    expect(await txCount(u)).toBe(1);
    expect(await db.select().from(recurringOccurrence).where(eq(recurringOccurrence.userId, u))).toHaveLength(0);
  });

  it("works for income, with an account", async () => {
    const u = await fresh();
    const acc = await createAccount(u, { name: "Bank" });
    await rule(u, { kind: "income", categoryId: salary, accountId: acc, description: "Salary", amount: "300000", frequency: "weekly", startDate: "2025-03-03" });
    await generateOccurrences({ userId: u, now: NOW });
    const [p] = await listPending(u);
    const tid = await postOccurrence(u, p.id);
    const [t] = await db.select().from(transactions).where(eq(transactions.id, tid));
    expect(t).toMatchObject({ kind: "income", accountId: acc });
  });
});

describe("rules", () => {
  it("validates input, category type and account ownership", async () => {
    const u = await fresh();
    const other = await fresh();
    const theirs = await createAccount(other, { name: "Theirs" });
    expect(await code(rule(u, { categoryId: salary }))).toBe("VALIDATION"); // income category on an expense rule
    expect(await code(rule(u, { accountId: theirs }))).toBe("VALIDATION");
    for (const bad of [{ amount: "0" }, { intervalCount: 0 }, { intervalCount: 53 }, { frequency: "daily" }, { startDate: "2025-02-30" }, { endDate: "2024-12-31" }, { userId: "x" }]) {
      expect(await code(rule(u, bad))).toBe("other:ZodError");
    }
  });

  it("edits only the allowed fields", async () => {
    const u = await fresh();
    const id = await rule(u);
    await updateRule(u, id, { amount: "55000", description: "Rent (new)", endDate: "2026-01-01" });
    expect((await listRules(u))[0]).toMatchObject({ amount: "55000.00", description: "Rent (new)", endDate: "2026-01-01" });
    expect(await code(updateRule(u, id, { frequency: "weekly" } as never))).toBe("other:ZodError");
    expect(await code(updateRule(u, id, { endDate: "2024-01-01" }))).toBe("VALIDATION");
  });

  it("hides other users' rules and occurrences", async () => {
    const a = await fresh();
    const b = await fresh();
    const id = await rule(a);
    await generateOccurrences({ userId: a, now: D("2025-02-10") });
    const [p] = await listPending(a);
    expect(await code(updateRule(b, id, { amount: "1" }))).toBe("NOT_FOUND");
    expect(await code(pauseRule(b, id))).toBe("NOT_FOUND");
    expect(await code(deleteRule(b, id))).toBe("NOT_FOUND");
    expect(await code(postOccurrence(b, p.id))).toBe("NOT_FOUND");
    expect(await code(skipOccurrence(b, p.id))).toBe("NOT_FOUND");
    expect(await listPending(b)).toEqual([]);
    expect(await listRules(b)).toEqual([]);
  });

  it("deleting a user cascades rules and occurrences", async () => {
    const u = await createTestUser();
    await rule(u);
    await generateOccurrences({ userId: u, now: D("2025-02-10") });
    await expect(deleteTestUsers([u])).resolves.toBeUndefined();
    expect(await db.select().from(recurringRule).where(eq(recurringRule.userId, u))).toHaveLength(0);
  });
});

describe("cron endpoint", () => {
  const call = (auth?: string) => cron(new Request("http://localhost/api/cron/recurring", { headers: auth ? { authorization: auth } : {} }));

  it("rejects missing and wrong credentials", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(env.CRON_SECRET)).status).toBe(401); // the secret without the Bearer prefix
  });

  it("runs the job with the right secret", async () => {
    const res = await call(`Bearer ${env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
