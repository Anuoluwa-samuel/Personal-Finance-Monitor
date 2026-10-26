import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getDashboard } from "@/server/analytics";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
let food: string;
let transport: string;
let salary: string;

const NOW = new Date("2025-03-15T12:00:00Z"); // 15 March 2025 in Lagos

const add = (userId: string, kind: "income" | "expense", amount: string, date: string, categoryId?: string, description = "x") =>
  createTransaction(userId, {
    kind,
    amount,
    description,
    categoryId: categoryId ?? (kind === "income" ? salary : food),
    transactionDate: date,
  });

beforeAll(async () => {
  food = await systemCategoryId("expense", "Food and groceries");
  transport = await systemCategoryId("expense", "Transport");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(async () => {
  await deleteTestUsers(users);
});

async function freshUser() {
  const id = await createTestUser();
  users.push(id);
  return id;
}

describe("empty dataset", () => {
  it("returns zeroes and zero-filled series, not invented data", async () => {
    const u = await freshUser();
    const d = await getDashboard(u, {}, NOW);
    expect(d.totals).toEqual({ income: "0.00", expense: "0.00", net: "0.00", incomeCount: 0, expenseCount: 0 });
    expect(d.recordedBalance).toBe("0.00");
    expect(d.expenseByCategory).toEqual([]);
    expect(d.series.granularity).toBe("day");
    expect(d.series.points).toHaveLength(31);
    expect(d.series.points.every((p) => p.income === "0.00" && p.expense === "0.00")).toBe(true);
    expect(d.monthly).toHaveLength(12);
    expect(d.monthly.at(-1)!.bucket).toBe("2025-03-01");
    expect(d.monthly[0].bucket).toBe("2024-04-01");
  });
});

describe("totals", () => {
  it("sums exactly and applies inclusive period boundaries", async () => {
    const u = await freshUser();
    await add(u, "income", "0.10", "2025-03-01"); // first day: in
    await add(u, "income", "0.20", "2025-03-31"); // last day: in
    await add(u, "income", "1000.00", "2025-02-28"); // before: out
    await add(u, "income", "2000.00", "2025-04-01"); // after: out
    await add(u, "expense", "0.05", "2025-03-15");
    const d = await getDashboard(u, { preset: "this_month" }, NOW);
    expect(d.totals.income).toBe("0.30");
    expect(d.totals.expense).toBe("0.05");
    expect(d.totals.net).toBe("0.25");
    expect(d.totals.incomeCount).toBe(2);
    expect(d.totals.expenseCount).toBe(1);
  });

  it("recorded balance is all-time and ignores the selected period", async () => {
    const u = await freshUser();
    await add(u, "income", "1000.00", "2024-01-10");
    await add(u, "expense", "250.50", "2024-06-01");
    await add(u, "expense", "10.00", "2025-03-02");
    const jan = await getDashboard(u, { preset: "custom", from: "2025-03-01", to: "2025-03-31" }, NOW);
    expect(jan.totals.net).toBe("-10.00");
    expect(jan.recordedBalance).toBe("739.50");
  });

  it("can go negative without error", async () => {
    const u = await freshUser();
    await add(u, "expense", "5.00", "2025-03-02");
    expect((await getDashboard(u, {}, NOW)).totals.net).toBe("-5.00");
  });

  it("handles large values exactly", async () => {
    const u = await freshUser();
    await add(u, "income", "999999999999.99", "2025-03-02");
    await add(u, "income", "999999999999.99", "2025-03-03");
    expect((await getDashboard(u, {}, NOW)).totals.income).toBe("1999999999999.98");
  });
});

describe("timezone", () => {
  it("uses the user's timezone to decide the current month at the boundary", async () => {
    const u = await freshUser();
    await add(u, "expense", "10.00", "2025-03-31");
    await add(u, "expense", "20.00", "2025-04-01");
    const edge = new Date("2025-03-31T23:30:00Z"); // 31 Mar in UTC, already 1 Apr in Lagos
    expect((await getDashboard(u, { preset: "this_month" }, edge)).totals.expense).toBe("20.00");
    await db.update(userPreferences).set({ timezone: "UTC" }).where(eq(userPreferences.userId, u));
    expect((await getDashboard(u, { preset: "this_month" }, edge)).totals.expense).toBe("10.00");
  });
});

describe("category breakdown", () => {
  it("lists expenses only, largest first, with shares that reflect the total", async () => {
    const u = await freshUser();
    await add(u, "expense", "300.00", "2025-03-02", food);
    await add(u, "expense", "100.00", "2025-03-03", transport);
    await add(u, "expense", "100.00", "2025-03-04", food);
    await add(u, "income", "9999.00", "2025-03-05");
    const d = await getDashboard(u, {}, NOW);
    expect(d.expenseByCategory.map((c) => [c.name, c.amount, c.sharePercent])).toEqual([
      ["Food and groceries", "400.00", 80],
      ["Transport", "100.00", 20],
    ]);
  });
});

describe("edits and deletes flow through immediately", () => {
  it("recomputes from rows with no stale totals", async () => {
    const u = await freshUser();
    const a = await add(u, "expense", "100.00", "2025-03-02");
    const b = await add(u, "income", "500.00", "2025-03-02");
    await updateTransaction(u, a.id, { amount: "40.00" });
    let d = await getDashboard(u, {}, NOW);
    expect(d.totals.expense).toBe("40.00");
    await updateTransaction(u, a.id, { transactionDate: "2025-02-10" }); // moved out of the period
    d = await getDashboard(u, {}, NOW);
    expect(d.totals.expense).toBe("0.00");
    await deleteTransaction(u, b.id);
    d = await getDashboard(u, {}, NOW);
    expect(d.totals.income).toBe("0.00");
    expect(d.recordedBalance).toBe("-40.00");
  });

  it("does not double-count a transaction whose kind was changed", async () => {
    const u = await freshUser();
    const t = await add(u, "expense", "70.00", "2025-03-02");
    await updateTransaction(u, t.id, { kind: "income", categoryId: salary });
    const d = await getDashboard(u, {}, NOW);
    expect(d.totals).toMatchObject({ income: "70.00", expense: "0.00", incomeCount: 1, expenseCount: 0 });
  });
});

describe("isolation", () => {
  it("never includes another user's records", async () => {
    const a = await freshUser();
    const b = await freshUser();
    await add(a, "income", "123456.00", "2025-03-02");
    const d = await getDashboard(b, {}, NOW);
    expect(d.totals.income).toBe("0.00");
    expect(d.recordedBalance).toBe("0.00");
  });
});

describe("series", () => {
  it("uses daily buckets up to 62 days and monthly beyond", async () => {
    const u = await freshUser();
    await add(u, "expense", "10.00", "2025-03-05");
    await add(u, "expense", "5.00", "2025-03-05");
    const short = await getDashboard(u, { preset: "custom", from: "2025-03-01", to: "2025-03-10" }, NOW);
    expect(short.series.granularity).toBe("day");
    expect(short.series.points).toHaveLength(10);
    expect(short.series.points.find((p) => p.bucket === "2025-03-05")!.expense).toBe("15.00");

    const long = await getDashboard(u, { preset: "this_year" }, NOW);
    expect(long.series.granularity).toBe("month");
    expect(long.series.points).toHaveLength(12);
    expect(long.series.points.find((p) => p.bucket === "2025-03-01")!.expense).toBe("15.00");
  });

  it("series totals equal the headline totals (no double counting)", async () => {
    const u = await freshUser();
    for (let i = 1; i <= 20; i++) await add(u, i % 3 ? "expense" : "income", `${i}.07`, `2025-03-${String(i).padStart(2, "0")}`);
    const d = await getDashboard(u, {}, NOW);
    const sum = (key: "income" | "expense") =>
      d.series.points.reduce((acc, p) => acc + BigInt(p[key].replace(".", "")), 0n);
    expect(sum("income")).toBe(BigInt(d.totals.income.replace(".", "")));
    expect(sum("expense")).toBe(BigInt(d.totals.expense.replace(".", "")));
  });

  it("monthly trend covers 12 months ending now even for the 'last month' view", async () => {
    const u = await freshUser();
    await add(u, "income", "10.00", "2024-04-30");
    await add(u, "income", "20.00", "2025-03-01");
    const d = await getDashboard(u, { preset: "this_year" }, NOW); // year ends in the future; trend stops at today's month
    expect(d.monthly).toHaveLength(12);
    expect(d.monthly[0]).toMatchObject({ bucket: "2024-04-01", income: "10.00" });
    expect(d.monthly[11]).toMatchObject({ bucket: "2025-03-01", income: "20.00" });
  });
});

describe("validation", () => {
  it("rejects bad custom ranges with VALIDATION", async () => {
    const u = await freshUser();
    for (const input of [
      { preset: "custom", from: "2025-03-10", to: "2025-03-01" },
      { preset: "custom", from: "nope", to: "2025-03-01" },
      { preset: "weird" },
    ]) {
      await expect(getDashboard(u, input, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(getDashboard(u, input, NOW)).rejects.toBeInstanceOf(AppError);
    }
  });
});
