import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, moneyAccount, transactions as t } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  decimalToMinor,
  minorToDecimal,
  percentOf,
  type CurrencyCode,
} from "./domain/money";
import {
  PeriodError,
  addDays,
  addMonths,
  daysBetween,
  firstOfMonth,
  lastOfMonth,
  resolvePeriod,
  todayIn,
  type Period,
  type PeriodInput,
} from "./domain/periods";
import { getPreferences } from "./preferences";

/**
 * Dashboard figures. Everything is aggregated in SQL from the transactions
 * table (the single source of truth) with exact NUMERIC sums; nothing is
 * cached or stored. Amounts leave this module as canonical decimal strings.
 *
 * Definitions (also in the README):
 * - income / expenses: sums of income / expense rows dated inside the period.
 * - net cash flow: income - expenses for the period.
 * - recorded balance: opening balances of all accounts (archived included) + ALL-TIME income - expenses.
 *   It reflects only what the user has recorded, not a bank balance.
 */

export type SeriesPoint = { bucket: string; income: string; expense: string; net: string };

export type DashboardData = {
  period: Period;
  currency: CurrencyCode;
  timezone: string;
  totals: { income: string; expense: string; net: string; incomeCount: number; expenseCount: number };
  recordedBalance: string;
  expenseByCategory: { categoryId: string; name: string; amount: string; sharePercent: number }[];
  /** Day buckets for periods of up to 62 days, month buckets otherwise. Empty buckets are real zeroes. */
  series: { granularity: "day" | "month"; points: SeriesPoint[] };
  /** The 12 calendar months ending with the month of min(period end, today). */
  monthly: SeriesPoint[];
};

const DAY_SERIES_MAX_DAYS = 62;

const sumWhere = (kind: "income" | "expense") =>
  sql<string>`coalesce(sum(${t.amount}) filter (where ${t.kind} = ${kind}), 0)`;

function bucketRows(gran: "day" | "month", userId: string, from: string, to: string) {
  const bucket = sql<string>`to_char(date_trunc(${sql.raw(`'${gran}'`)}, ${t.transactionDate}), 'YYYY-MM-DD')`;
  return db
    .select({ bucket, income: sumWhere("income"), expense: sumWhere("expense") })
    .from(t)
    .where(and(eq(t.userId, userId), sql`${t.transactionDate} between ${from} and ${to}`))
    .groupBy(bucket);
}

function fillBuckets(
  gran: "day" | "month",
  from: string,
  to: string,
  rows: { bucket: string; income: string; expense: string }[],
  currency: CurrencyCode,
): SeriesPoint[] {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const out: SeriesPoint[] = [];
  let cursor = gran === "day" ? from : firstOfMonth(from);
  while (cursor <= to) {
    const r = byBucket.get(cursor);
    const income = r ? decimalToMinor(r.income, currency) : 0n;
    const expense = r ? decimalToMinor(r.expense, currency) : 0n;
    out.push({
      bucket: cursor,
      income: minorToDecimal(income, currency),
      expense: minorToDecimal(expense, currency),
      net: minorToDecimal(income - expense, currency),
    });
    cursor = gran === "day" ? addDays(cursor, 1) : addMonths(cursor, 1);
  }
  return out;
}

export async function getDashboard(
  userId: string,
  periodInput: PeriodInput = {},
  now: Date = new Date(),
): Promise<DashboardData> {
  const { currency, timezone } = await getPreferences(userId);

  let period: Period;
  try {
    period = resolvePeriod(periodInput, timezone, now);
  } catch (e) {
    if (e instanceof PeriodError) throw new AppError("VALIDATION", e.message);
    throw e;
  }
  const { from, to } = period;
  const inPeriod = sql`${t.transactionDate} between ${from} and ${to}`;

  const gran: "day" | "month" = daysBetween(from, to) + 1 <= DAY_SERIES_MAX_DAYS ? "day" : "month";

  const today = todayIn(timezone, now);
  const monthlyEnd = lastOfMonth(to < today ? to : today);
  const monthlyStart = addMonths(monthlyEnd, -11);

  const [[agg], [opening], cats, seriesRows, monthlyRows] = await Promise.all([
    db
      .select({
        pIncome: sql<string>`coalesce(sum(${t.amount}) filter (where ${t.kind} = 'income' and ${inPeriod}), 0)`,
        pExpense: sql<string>`coalesce(sum(${t.amount}) filter (where ${t.kind} = 'expense' and ${inPeriod}), 0)`,
        pIncomeCount: sql<number>`(count(*) filter (where ${t.kind} = 'income' and ${inPeriod}))::int`,
        pExpenseCount: sql<number>`(count(*) filter (where ${t.kind} = 'expense' and ${inPeriod}))::int`,
        allIncome: sumWhere("income"),
        allExpense: sumWhere("expense"),
      })
      .from(t)
      .where(eq(t.userId, userId)),
    db
      .select({ total: sql<string>`coalesce(sum(${moneyAccount.openingBalance}), 0)` })
      .from(moneyAccount)
      .where(eq(moneyAccount.userId, userId)),
    db
      .select({
        categoryId: category.id,
        name: category.name,
        amount: sql<string>`sum(${t.amount})`,
      })
      .from(t)
      .innerJoin(category, eq(category.id, t.categoryId))
      .where(and(eq(t.userId, userId), eq(t.kind, "expense"), inPeriod))
      .groupBy(category.id, category.name)
      .orderBy(desc(sql`sum(${t.amount})`), category.name)
      .limit(50),
    bucketRows(gran, userId, from, to),
    bucketRows("month", userId, monthlyStart, monthlyEnd),
  ]);

  const income = decimalToMinor(agg.pIncome, currency);
  const expense = decimalToMinor(agg.pExpense, currency);
  const balance = decimalToMinor(opening.total, currency) + decimalToMinor(agg.allIncome, currency) - decimalToMinor(agg.allExpense, currency);

  return {
    period,
    currency,
    timezone,
    totals: {
      income: minorToDecimal(income, currency),
      expense: minorToDecimal(expense, currency),
      net: minorToDecimal(income - expense, currency),
      incomeCount: agg.pIncomeCount,
      expenseCount: agg.pExpenseCount,
    },
    recordedBalance: minorToDecimal(balance, currency),
    expenseByCategory: cats.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      amount: minorToDecimal(decimalToMinor(c.amount, currency), currency),
      sharePercent: percentOf(decimalToMinor(c.amount, currency), expense),
    })),
    series: { granularity: gran, points: fillBuckets(gran, from, to, seriesRows, currency) },
    monthly: fillBuckets("month", monthlyStart, monthlyEnd, monthlyRows, currency),
  };
}
