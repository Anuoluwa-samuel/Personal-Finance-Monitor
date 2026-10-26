import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { savingsContribution, savingsGoal } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getDashboard } from "@/server/analytics";
import {
  addContribution,
  archiveGoal,
  completeGoal,
  createGoal,
  deleteContribution,
  deleteGoal,
  getGoal,
  getSavingsSummary,
  listGoals,
  reopenGoal,
  restoreGoal,
  updateGoal,
} from "@/server/savings";
import { createTransaction } from "@/server/transactions";
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
const goal = (u: string, over: Record<string, unknown> = {}) =>
  createGoal(u, { name: "Laptop", target: "1000", ...over } as never);
const put = (u: string, id: string, amount: string, over: Record<string, unknown> = {}) =>
  addContribution(u, id, { amount, contributedOn: "2025-03-10", ...over });

afterAll(() => deleteTestUsers(users));

describe("create", () => {
  it("stores target, starting amount and date exactly", async () => {
    const u = await fresh();
    const id = await goal(u, { name: "  Emergency fund ", target: "250000.50", startingAmount: "1000", targetDate: "2026-12-31" });
    const g = await getGoal(u, id);
    expect(g).toMatchObject({ name: "Emergency fund", target: "250000.50", startingAmount: "1000.00", targetDate: "2026-12-31", status: "active" });
    expect(g.progress).toMatchObject({ contributed: "0.00", saved: "1000.00", remaining: "249000.50", reached: false });
  });

  it("defaults the starting amount to zero and the date to none", async () => {
    const u = await fresh();
    const g = await getGoal(u, await goal(u));
    expect(g).toMatchObject({ startingAmount: "0.00", targetDate: null });
  });

  it("rejects bad input and a starting amount above the target", async () => {
    const u = await fresh();
    for (const bad of [{ target: "0" }, { target: "-5" }, { target: "1.234" }, { name: "  " }, { targetDate: "2025-02-30" }, { startingAmount: "-1" }, { userId: "x" }]) {
      expect(await code(goal(u, bad))).toBe("other:ZodError");
    }
    expect(await code(goal(u, { startingAmount: "1000.01" }))).toBe("VALIDATION");
    await expect(goal(u, { startingAmount: "1000" })).resolves.toBeTruthy(); // equal is allowed (already funded)
  });
});

describe("contributions", () => {
  it("adds up exactly and lists newest first", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "1", startingAmount: "0.20" });
    await put(u, id, "0.10", { contributedOn: "2025-03-01" });
    await put(u, id, "0.20", { contributedOn: "2025-03-05", note: "gift" });
    const g = await getGoal(u, id);
    expect(g.progress).toMatchObject({ contributed: "0.30", saved: "0.50", remaining: "0.50", percent: 50 });
    expect(g.contributions.map((c) => [c.contributedOn, c.amount, c.note])).toEqual([["2025-03-05", "0.20", "gift"], ["2025-03-01", "0.10", null]]);
  });

  it("refuses to exceed the target, and allows exactly the remainder", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "100", startingAmount: "40" });
    expect(await code(put(u, id, "60.01"))).toBe("VALIDATION");
    await expect(put(u, id, "60")).resolves.toBeTruthy();
    expect((await getGoal(u, id)).progress).toMatchObject({ reached: true, percent: 100, remaining: "0.00" });
    expect(await code(put(u, id, "0.01"))).toBe("VALIDATION");
  });

  it("cannot be overfunded by concurrent requests", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "100" });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => put(u, id, "30")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3); // 3 x 30 = 90; the 4th would reach 120
    const g = await getGoal(u, id);
    expect(g.progress.saved).toBe("90.00");
  });

  it("rejects zero, negative and malformed contributions", async () => {
    const u = await fresh();
    const id = await goal(u);
    for (const amount of ["0", "-1", "1.005", "abc"]) expect(await code(put(u, id, amount))).toBe("other:ZodError");
    expect(await code(put(u, id, "5", { contributedOn: "2025-13-01" }))).toBe("other:ZodError");
  });

  it("is idempotent per key, including when the goal is already full", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "50" });
    const key = "contrib-key-0000001";
    const a = await put(u, id, "50", { idempotencyKey: key });
    const b = await put(u, id, "50", { idempotencyKey: key }); // retry after the goal filled up
    expect(b.id).toBe(a.id);
    expect(await db.select().from(savingsContribution).where(eq(savingsContribution.goalId, id))).toHaveLength(1);
    expect(await code(put(u, id, "10", { idempotencyKey: key }))).toBe("CONFLICT");
  });

  it("can be deleted to correct a mistake, freeing room again", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "100" });
    const c = await put(u, id, "100");
    await deleteContribution(u, c.id);
    expect((await getGoal(u, id)).progress).toMatchObject({ saved: "0.00", reached: false });
    await expect(put(u, id, "100")).resolves.toBeTruthy();
  });
});

describe("edit", () => {
  it("changes name, date and target while active, but never below what is saved", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "100" });
    await put(u, id, "60");
    await updateGoal(u, id, { name: "Bigger", target: "500", targetDate: "2027-01-01" });
    expect(await getGoal(u, id)).toMatchObject({ name: "Bigger", target: "500.00", targetDate: "2027-01-01" });
    expect(await code(updateGoal(u, id, { target: "59.99" }))).toBe("VALIDATION");
    await expect(updateGoal(u, id, { target: "60" })).resolves.toBeUndefined();
    expect(await code(updateGoal(u, id, { startingAmount: "1" }))).toBe("VALIDATION"); // 1 + 60 > 60
    await updateGoal(u, id, { targetDate: null });
    expect((await getGoal(u, id)).targetDate).toBeNull();
  });
});

describe("status lifecycle", () => {
  it("completes, blocks changes while complete, reopens, archives and restores", async () => {
    const u = await fresh();
    const id = await goal(u);
    await completeGoal(u, id);
    const done = await getGoal(u, id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(await code(put(u, id, "5"))).toBe("CONFLICT");
    expect(await code(updateGoal(u, id, { name: "x" }))).toBe("CONFLICT");
    await completeGoal(u, id); // idempotent

    await reopenGoal(u, id);
    expect((await getGoal(u, id))).toMatchObject({ status: "active", completedAt: null });
    await expect(put(u, id, "5")).resolves.toBeTruthy();

    await archiveGoal(u, id);
    expect((await getGoal(u, id)).status).toBe("archived");
    expect(await code(put(u, id, "5"))).toBe("CONFLICT");
    expect(await code(completeGoal(u, id))).toBe("CONFLICT");
    await restoreGoal(u, id);
    expect((await getGoal(u, id)).status).toBe("active");
    expect(await code(restoreGoal(u, id))).toBe(null); // already active: no-op
  });

  it("blocks deleting contributions on non-active goals", async () => {
    const u = await fresh();
    const id = await goal(u);
    const c = await put(u, id, "5");
    await completeGoal(u, id);
    expect(await code(deleteContribution(u, c.id))).toBe("CONFLICT");
  });

  it("keeps archived goals and their history readable", async () => {
    const u = await fresh();
    const id = await goal(u);
    await put(u, id, "25");
    await archiveGoal(u, id);
    const g = (await listGoals(u)).find((x) => x.id === id)!;
    expect(g).toMatchObject({ status: "archived" });
    expect(g.progress.saved).toBe("25.00");
    expect((await getGoal(u, id)).contributions).toHaveLength(1);
  });

  it("deleting a goal removes its contributions", async () => {
    const u = await fresh();
    const id = await goal(u);
    await put(u, id, "5");
    await deleteGoal(u, id);
    expect(await code(getGoal(u, id))).toBe("NOT_FOUND");
    expect(await db.select().from(savingsContribution).where(eq(savingsContribution.goalId, id))).toHaveLength(0);
    expect(await code(deleteGoal(u, id))).toBe("NOT_FOUND");
  });
});

describe("ownership", () => {
  it("hides other users' goals and contributions for every operation", async () => {
    const a = await fresh();
    const b = await fresh();
    const id = await goal(a);
    const c = await put(a, id, "10");
    expect(await code(getGoal(b, id))).toBe("NOT_FOUND");
    expect(await code(updateGoal(b, id, { name: "x" }))).toBe("NOT_FOUND");
    expect(await code(put(b, id, "1"))).toBe("NOT_FOUND");
    expect(await code(deleteContribution(b, c.id))).toBe("NOT_FOUND");
    expect(await code(completeGoal(b, id))).toBe("NOT_FOUND");
    expect(await code(archiveGoal(b, id))).toBe("NOT_FOUND");
    expect(await code(deleteGoal(b, id))).toBe("NOT_FOUND");
    expect(await listGoals(b)).toEqual([]);
    expect((await getGoal(a, id)).progress.saved).toBe("10.00");
  });

  it("does not let a user reuse another user's idempotency key to read or block their data", async () => {
    const a = await fresh();
    const b = await fresh();
    const ga = await goal(a);
    const gb = await goal(b);
    const key = "shared-key-0000001";
    await put(a, ga, "10", { idempotencyKey: key });
    const other = await put(b, gb, "10", { idempotencyKey: key });
    expect((await getGoal(b, gb)).contributions[0].id).toBe(other.id);
  });
});

describe("separation from income, expenses and the dashboard", () => {
  const NOW = new Date("2025-03-15T12:00:00Z");

  it("contributions never change income, expenses, net or balance", async () => {
    const u = await fresh();
    const salary = await systemCategoryId("income", "Salary");
    await createTransaction(u, { kind: "income", amount: "1000", description: "Pay", categoryId: salary, transactionDate: "2025-03-02" });
    const before = await getDashboard(u, {}, NOW);
    const id = await goal(u, { target: "500" });
    await put(u, id, "300", { contributedOn: "2025-03-05" });
    const after = await getDashboard(u, {}, NOW);
    expect(after.totals).toEqual(before.totals);
    expect(after.recordedBalance).toBe(before.recordedBalance);
  });

  it("summarises contributions inside a period and newest active goals", async () => {
    const u = await fresh();
    const id = await goal(u, { target: "500", startingAmount: "50" });
    await put(u, id, "100", { contributedOn: "2025-03-01" });
    await put(u, id, "25.50", { contributedOn: "2025-03-31" });
    await put(u, id, "10", { contributedOn: "2025-02-28" }); // outside
    const done = await goal(u, { name: "Old" });
    await completeGoal(u, done);
    const s = await getSavingsSummary(u, "2025-03-01", "2025-03-31");
    expect(s).toMatchObject({ contributedInPeriod: "125.50", contributionCount: 2 });
    expect(s.activeGoals).toHaveLength(1); // completed goals are not listed as active
    expect(s.activeGoals[0].progress.saved).toBe("185.50");
  });
});

describe("database constraints and account deletion", () => {
  it("rejects invalid rows written directly", async () => {
    const u = await fresh();
    await expect(db.insert(savingsGoal).values({ userId: u, name: "x", target: "0" })).rejects.toThrow();
    await expect(db.insert(savingsGoal).values({ userId: u, name: "x", target: "10", startingAmount: "11" })).rejects.toThrow();
    await expect(db.insert(savingsGoal).values({ userId: u, name: "  ", target: "10" })).rejects.toThrow();
    const id = await goal(u);
    await expect(db.insert(savingsContribution).values({ goalId: id, userId: u, amount: "0", contributedOn: "2025-01-01" })).rejects.toThrow();
  });

  it("deleting a user removes goals and contributions", async () => {
    const u = await createTestUser();
    const id = await goal(u);
    await put(u, id, "5");
    await expect(deleteTestUsers([u])).resolves.toBeUndefined();
    expect(await db.select().from(savingsGoal).where(eq(savingsGoal.userId, u))).toHaveLength(0);
    expect(await db.select().from(savingsContribution).where(eq(savingsContribution.userId, u))).toHaveLength(0);
  });
});
