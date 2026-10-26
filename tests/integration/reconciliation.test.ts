import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { createAccount, listAccounts } from "@/server/accounts";
import { getDashboard } from "@/server/analytics";
import { createBudget, getBudget } from "@/server/budgets";
import { parseCsv } from "@/server/domain/csv-parse";
import { decimalToMinor, minorToDecimal, parseAmount, sumMinor } from "@/server/domain/money";
import { exportTransactionsCsv } from "@/server/export";
import { listTransactions } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";
import { rng } from "../support/prng";

/**
 * Every screen that shows totals must tell the same story. This builds a random but reproducible dataset and
 * checks that the dashboard, the transaction list, the CSV export, account balances and budgets agree exactly.
 */
const users: string[] = [];
const NOW = new Date("2025-06-30T12:00:00Z");
const FROM = "2025-01-01";
const TO = "2025-06-30";

type Row = { kind: "income" | "expense"; minor: bigint; date: string; categoryId: string; accountId: string | null };
let rows: Row[];
let uid: string;
let accounts: { id: string; opening: bigint }[];
let food: string;
let transport: string;
let salary: string;

const sum = (xs: Row[]) => sumMinor(xs.map((x) => x.minor));

beforeAll(async () => {
  food = await systemCategoryId("expense", "Food and groceries");
  transport = await systemCategoryId("expense", "Transport");
  salary = await systemCategoryId("income", "Salary");
  uid = await createTestUser();
  const noise = await createTestUser();
  users.push(uid, noise);

  const r = rng(2024);
  accounts = [];
  for (const [name, opening] of [["Bank", "1000.50"], ["Cash", "20"], ["Wallet", "0"]] as const) {
    accounts.push({ id: await createAccount(uid, { name, openingBalance: opening }), opening: parseAmount(opening === "0" ? "0.01" : opening) - (opening === "0" ? 1n : 0n) });
  }

  rows = Array.from({ length: 300 }, () => {
    const kind = r.next() < 0.25 ? "income" : "expense";
    const month = r.int(1, 6);
    const day = r.int(1, month === 2 ? 28 : 30);
    return {
      kind,
      minor: BigInt(r.int(1, 5_000_000)), // up to 50,000.00 in kobo
      date: `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      categoryId: kind === "income" ? salary : r.next() < 0.5 ? food : transport,
      accountId: r.next() < 0.3 ? null : r.pick(accounts).id,
    } as Row;
  });
  await db.insert(transactions).values(
    rows.map((x, i) => ({ userId: uid, kind: x.kind, amount: minorToDecimal(x.minor), description: `row ${i}`, categoryId: x.categoryId, accountId: x.accountId, transactionDate: x.date })),
  );
  // Another user's data must never leak into any figure.
  await db.insert(transactions).values(
    Array.from({ length: 50 }, (_, i) => ({ userId: noise, kind: "expense" as const, amount: "123456.78", description: `noise ${i}`, categoryId: food, transactionDate: "2025-03-03" })),
  );
});
afterAll(() => deleteTestUsers(users));

describe("one dataset, every view agrees", () => {
  it("dashboard totals equal the sums of the underlying rows", async () => {
    const d = await getDashboard(uid, { preset: "custom", from: FROM, to: TO }, NOW);
    const income = sum(rows.filter((x) => x.kind === "income"));
    const expense = sum(rows.filter((x) => x.kind === "expense"));
    expect(d.totals.income).toBe(minorToDecimal(income));
    expect(d.totals.expense).toBe(minorToDecimal(expense));
    expect(d.totals.net).toBe(minorToDecimal(income - expense));
    expect(d.totals.incomeCount + d.totals.expenseCount).toBe(300);
  });

  it("recorded balance = opening balances + income - expenses, all time", async () => {
    const d = await getDashboard(uid, { preset: "custom", from: FROM, to: TO }, NOW);
    const openings = (await listAccounts(uid)).reduce((a, x) => a + decimalToMinor(x.openingBalance), 0n);
    const net = sum(rows.filter((x) => x.kind === "income")) - sum(rows.filter((x) => x.kind === "expense"));
    expect(d.recordedBalance).toBe(minorToDecimal(openings + net));
  });

  it("the category breakdown, the daily/monthly series and the 12-month trend all add up to the headline figures", async () => {
    const d = await getDashboard(uid, { preset: "custom", from: FROM, to: TO }, NOW);
    expect(sumMinor(d.expenseByCategory.map((c) => decimalToMinor(c.amount)))).toBe(decimalToMinor(d.totals.expense));
    expect(d.series.granularity).toBe("month");
    expect(sumMinor(d.series.points.map((p) => decimalToMinor(p.income)))).toBe(decimalToMinor(d.totals.income));
    expect(sumMinor(d.series.points.map((p) => decimalToMinor(p.expense)))).toBe(decimalToMinor(d.totals.expense));
    expect(sumMinor(d.series.points.map((p) => decimalToMinor(p.net)))).toBe(decimalToMinor(d.totals.net));
    expect(sumMinor(d.monthly.map((p) => decimalToMinor(p.net)))).toBe(decimalToMinor(d.totals.net)); // all data lies inside the 12 months
  });

  it("paging through the list sees every row exactly once with the same total", async () => {
    const seen = new Set<string>();
    let total = 0n;
    for (let page = 1; page <= 10; page++) {
      const p = await listTransactions(uid, { page, pageSize: 100, sort: "amount", dir: "desc" });
      expect(p.total).toBe(300);
      for (const t of p.items) {
        expect(seen.has(t.id)).toBe(false);
        seen.add(t.id);
        total += decimalToMinor(t.amount) * (t.kind === "income" ? 1n : -1n);
      }
      if (p.items.length < 100) break;
    }
    expect(seen.size).toBe(300);
    expect(total).toBe(sum(rows.filter((x) => x.kind === "income")) - sum(rows.filter((x) => x.kind === "expense")));
  });

  it("the CSV export has the same rows and totals", async () => {
    const { csv, count } = await exportTransactionsCsv(uid);
    expect(count).toBe(300);
    const table = parseCsv(csv).slice(1);
    expect(table).toHaveLength(300);
    const cell = (r: string[], col: number) => r[col];
    const inc = sumMinor(table.filter((r) => cell(r, 1) === "income").map((r) => parseAmount(cell(r, 2))));
    const exp = sumMinor(table.filter((r) => cell(r, 1) === "expense").map((r) => parseAmount(cell(r, 2))));
    expect(inc).toBe(sum(rows.filter((x) => x.kind === "income")));
    expect(exp).toBe(sum(rows.filter((x) => x.kind === "expense")));
  });

  it("account balances plus the unassigned net equal the overall recorded balance", async () => {
    const d = await getDashboard(uid, { preset: "custom", from: FROM, to: TO }, NOW);
    const accountsTotal = (await listAccounts(uid)).reduce((a, x) => a + decimalToMinor(x.balance), 0n);
    const unassigned = rows.filter((x) => !x.accountId);
    const unassignedNet = sum(unassigned.filter((x) => x.kind === "income")) - sum(unassigned.filter((x) => x.kind === "expense"));
    expect(minorToDecimal(accountsTotal + unassignedNet)).toBe(d.recordedBalance);
  });

  it("a budget's spending equals the month's expenses, and category lines never exceed it", async () => {
    const id = await createBudget(uid, { month: "2025-03", overallLimit: "999999999", lines: [{ categoryId: food, limit: "1000000" }, { categoryId: transport, limit: "1000000" }] });
    const b = await getBudget(uid, id);
    const march = rows.filter((x) => x.kind === "expense" && x.date.startsWith("2025-03"));
    expect(b.totalSpent).toBe(minorToDecimal(sum(march)));
    expect(b.overall?.spent).toBe(b.totalSpent);
    const lineSum = sumMinor(b.lines.map((l) => decimalToMinor(l.spent)));
    expect(lineSum).toBe(sumMinor(march.filter((x) => x.categoryId === food || x.categoryId === transport).map((x) => x.minor)));
    expect(lineSum).toBeLessThanOrEqual(decimalToMinor(b.totalSpent));
  });

  it("another user's 50 large expenses appear nowhere", async () => {
    const { csv } = await exportTransactionsCsv(uid);
    expect(csv).not.toContain("noise");
    expect(csv).not.toContain("123456.78");
    expect((await listTransactions(uid, { q: "noise" })).total).toBe(0);
  });
});
