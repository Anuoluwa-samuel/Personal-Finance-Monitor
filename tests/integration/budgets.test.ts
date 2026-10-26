import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { budget, budgetLine } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { archiveBudget, createBudget, getActiveBudgetForMonth, getBudget, listBudgets, updateBudget } from "@/server/budgets";
import { createCategory, setCategoryArchived } from "@/server/categories";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
let food: string;
let transport: string;
let salary: string;

const fresh = async () => {
  const u = await createTestUser();
  users.push(u);
  return u;
};
const spend = (u: string, amount: string, date: string, categoryId = food, kind: "expense" | "income" = "expense") =>
  createTransaction(u, { kind, amount, description: "x", categoryId: kind === "income" ? salary : categoryId, transactionDate: date });

async function code(p: Promise<unknown>) {
  const e = await p.then(() => null, (x) => x);
  return e instanceof AppError ? e.code : e instanceof Error ? `other:${e.name}` : null;
}

beforeAll(async () => {
  food = await systemCategoryId("expense", "Food and groceries");
  transport = await systemCategoryId("expense", "Transport");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(() => deleteTestUsers(users));

describe("create", () => {
  it("stores overall and category limits and reads them back exactly", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "1000.50", lines: [{ categoryId: food, limit: "300" }] });
    const b = await getBudget(u, id);
    expect(b.month).toBe("2025-03-01");
    expect(b.overall).toMatchObject({ limit: "1000.50", spent: "0.00", remaining: "1000.50", percent: 0, status: "ok" });
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0]).toMatchObject({ categoryName: "Food and groceries", limit: "300.00" });
  });

  it("requires some limit and rejects bad input", async () => {
    const u = await fresh();
    expect(await code(createBudget(u, { month: "2025-03", lines: [] }))).toBe("other:ZodError");
    expect(await code(createBudget(u, { month: "2025-13", overallLimit: "10" }))).toBe("other:ZodError");
    expect(await code(createBudget(u, { month: "2025-03", overallLimit: "0" }))).toBe("other:ZodError");
    expect(await code(createBudget(u, { month: "2025-03", overallLimit: "1.001" }))).toBe("other:ZodError");
    expect(await code(createBudget(u, { month: "2025-03", lines: [{ categoryId: food, limit: "5" }, { categoryId: food, limit: "6" }] }))).toBe("other:ZodError");
    expect(await code(createBudget(u, { month: "2025-03", overallLimit: "10", userId: "x" } as never))).toBe("other:ZodError");
  });

  it("allows only one active budget per month, and a new one after archiving", async () => {
    const u = await fresh();
    const first = await createBudget(u, { month: "2025-04", overallLimit: "100" });
    expect(await code(createBudget(u, { month: "2025-04", overallLimit: "200" }))).toBe("CONFLICT");
    await archiveBudget(u, first);
    await expect(createBudget(u, { month: "2025-04", overallLimit: "200" })).resolves.toBeTruthy();
  });

  it("collapses concurrent creates for the same month to one", async () => {
    const u = await fresh();
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => createBudget(u, { month: "2025-05", overallLimit: "100" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.select().from(budget).where(eq(budget.userId, u)))).toHaveLength(1);
  });

  it("rejects income, foreign and archived categories", async () => {
    const u = await fresh();
    const other = await fresh();
    const theirs = await createCategory(other, { type: "expense", name: "Theirs" });
    const mine = await createCategory(u, { type: "expense", name: "Mine gone" });
    await setCategoryArchived(u, mine.id, true);
    for (const categoryId of [salary, theirs.id, mine.id]) {
      expect(await code(createBudget(u, { month: "2025-06", lines: [{ categoryId, limit: "10" }] }))).toBe("VALIDATION");
    }
  });

  it("is blocked at the database level for income categories too", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-07", overallLimit: "10" });
    await expect(db.insert(budgetLine).values({ budgetId: id, categoryId: salary, limit: "5" })).rejects.toThrow();
    await expect(db.insert(budgetLine).values({ budgetId: id, categoryId: food, limit: "0" })).rejects.toThrow();
  });
});

describe("spending calculation", () => {
  it("counts only expenses inside the month, never income", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "1000", lines: [{ categoryId: food, limit: "200" }, { categoryId: transport, limit: "100" }] });
    await spend(u, "150.25", "2025-03-01"); // first day: in
    await spend(u, "49.75", "2025-03-31"); // last day: in
    await spend(u, "30", "2025-03-10", transport);
    await spend(u, "999", "2025-02-28"); // out
    await spend(u, "999", "2025-04-01"); // out
    await spend(u, "5000", "2025-03-15", food, "income"); // never counts
    const b = await getBudget(u, id);
    expect(b.totalSpent).toBe("230.00");
    expect(b.overall).toMatchObject({ spent: "230.00", remaining: "770.00", percent: 23, status: "ok" });
    const f = b.lines.find((l) => l.categoryName === "Food and groceries")!;
    expect(f).toMatchObject({ spent: "200.00", remaining: "0.00", status: "reached" });
    expect(b.lines.find((l) => l.categoryName === "Transport")).toMatchObject({ spent: "30.00", percent: 30 });
  });

  it("counts spending in categories without a line towards the overall limit", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100", lines: [{ categoryId: food, limit: "50" }] });
    await spend(u, "90", "2025-03-05", transport);
    const b = await getBudget(u, id);
    expect(b.overall).toMatchObject({ spent: "90.00", status: "approaching" });
    expect(b.lines[0].spent).toBe("0.00");
  });

  it("flags over-limit with a negative remainder", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", lines: [{ categoryId: food, limit: "100" }] });
    await spend(u, "130.10", "2025-03-05");
    const b = await getBudget(u, id);
    expect(b.overall).toBeNull();
    expect(b.lines[0]).toMatchObject({ status: "over", remaining: "-30.10", percent: 130.1 });
  });

  it("reflects edits and deletes immediately", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100" });
    const a = await spend(u, "60", "2025-03-05");
    const c = await spend(u, "30", "2025-03-06");
    expect((await getBudget(u, id)).overall).toMatchObject({ spent: "90.00", status: "approaching" });
    await updateTransaction(u, a.id, { amount: "10" });
    expect((await getBudget(u, id)).overall).toMatchObject({ spent: "40.00", status: "ok" });
    await updateTransaction(u, c.id, { transactionDate: "2025-04-02" }); // moved to another month
    expect((await getBudget(u, id)).overall?.spent).toBe("10.00");
    await deleteTransaction(u, a.id);
    expect((await getBudget(u, id)).overall?.spent).toBe("0.00");
  });

  it("does not double-count a transaction whose kind changes to income", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100" });
    const t = await spend(u, "50", "2025-03-05");
    await updateTransaction(u, t.id, { kind: "income", categoryId: salary });
    expect((await getBudget(u, id)).overall?.spent).toBe("0.00");
  });
});

describe("update, archive, history", () => {
  it("replaces lines atomically and keeps the month fixed", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100", lines: [{ categoryId: food, limit: "50" }] });
    await updateBudget(u, id, { overallLimit: null, lines: [{ categoryId: transport, limit: "70" }] });
    const b = await getBudget(u, id);
    expect(b.overall).toBeNull();
    expect(b.lines.map((l) => l.categoryName)).toEqual(["Transport"]);
    expect(b.month).toBe("2025-03-01");
    expect(await code(updateBudget(u, id, { overallLimit: null, lines: [] }))).toBe("other:ZodError");
  });

  it("keeps a line whose category was archived later, but refuses to add archived ones", async () => {
    const u = await fresh();
    const c = await createCategory(u, { type: "expense", name: "Soon archived" });
    const id = await createBudget(u, { month: "2025-03", lines: [{ categoryId: c.id, limit: "40" }] });
    await setCategoryArchived(u, c.id, true);
    await expect(updateBudget(u, id, { overallLimit: "500", lines: [{ categoryId: c.id, limit: "45" }] })).resolves.toBeUndefined();
    expect((await getBudget(u, id)).lines[0]).toMatchObject({ categoryArchived: true, limit: "45.00" });
    const id2 = await createBudget(u, { month: "2025-04", overallLimit: "10" });
    expect(await code(updateBudget(u, id2, { overallLimit: null, lines: [{ categoryId: c.id, limit: "5" }] }))).toBe("VALIDATION");
  });

  it("archived budgets drop out of 'active' but stay in history with their figures, and cannot be edited", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100" });
    await spend(u, "25", "2025-03-05");
    await archiveBudget(u, id);
    expect(await getActiveBudgetForMonth(u, "2025-03-17")).toBeNull();
    const hist = (await listBudgets(u)).find((b) => b.id === id)!;
    expect(hist).toMatchObject({ archived: true });
    expect(hist.overall?.spent).toBe("25.00");
    expect(await code(updateBudget(u, id, { overallLimit: "5" }))).toBe("CONFLICT");
    await expect(archiveBudget(u, id)).resolves.toBeUndefined(); // idempotent
  });

  it("lists history newest month first with correct spend per month (no cross-month leakage)", async () => {
    const u = await fresh();
    await createBudget(u, { month: "2025-01", overallLimit: "100" });
    await createBudget(u, { month: "2025-02", overallLimit: "100" });
    await spend(u, "10", "2025-01-15");
    await spend(u, "20", "2025-02-15");
    const list = await listBudgets(u);
    expect(list.map((b) => [b.month, b.overall?.spent])).toEqual([["2025-02-01", "20.00"], ["2025-01-01", "10.00"]]);
  });

  it("finds the active budget for any day in its month", async () => {
    const u = await fresh();
    const id = await createBudget(u, { month: "2025-03", overallLimit: "100" });
    expect((await getActiveBudgetForMonth(u, "2025-03-31"))?.id).toBe(id);
    expect(await getActiveBudgetForMonth(u, "2025-04-01")).toBeNull();
  });
});

describe("ownership", () => {
  it("hides other users' budgets for read, update and archive", async () => {
    const a = await fresh();
    const b = await fresh();
    const id = await createBudget(a, { month: "2025-03", overallLimit: "100" });
    expect(await code(getBudget(b, id))).toBe("NOT_FOUND");
    expect(await code(updateBudget(b, id, { overallLimit: "1" }))).toBe("NOT_FOUND");
    expect(await code(archiveBudget(b, id))).toBe("NOT_FOUND");
    expect(await listBudgets(b)).toEqual([]);
    expect((await getBudget(a, id)).overall?.limit).toBe("100.00");
  });

  it("does not let one user's spending move another user's budget", async () => {
    const a = await fresh();
    const b = await fresh();
    const idB = await createBudget(b, { month: "2025-03", overallLimit: "100" });
    await spend(a, "99", "2025-03-05");
    expect((await getBudget(b, idB)).overall?.spent).toBe("0.00");
  });
});

describe("account deletion", () => {
  it("removes budgets, lines and custom categories together, even when a line uses a custom category", async () => {
    const u = await createTestUser();
    const c = await createCategory(u, { type: "expense", name: "Custom for budget" });
    await createBudget(u, { month: "2025-03", overallLimit: "100", lines: [{ categoryId: c.id, limit: "20" }] });
    await spend(u, "5", "2025-03-05", c.id);
    await expect(deleteTestUsers([u])).resolves.toBeUndefined();
    expect(await db.select().from(budget).where(eq(budget.userId, u))).toHaveLength(0);
  });
});
