import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { budget, budgetLine, category, transactions as t } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  createBudgetSchema,
  updateBudgetSchema,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from "@/validators/budget";
import { idSchema } from "@/validators/transaction";
import { budgetProgress, monthToFirstDay, type BudgetStatus } from "./domain/budget-rules";
import { lastOfMonth } from "./domain/periods";
import { DEFAULT_CURRENCY, decimalToMinor, minorToDecimal, parseAmount } from "./domain/money";
import { isUniqueViolation } from "./categories";

/**
 * Spending shown against a budget is recomputed from transaction rows on every read (never stored), so edits and
 * deletes are reflected immediately. Only EXPENSE rows count; income, including refunds recorded as income, does
 * not reduce spend. The overall limit is compared with ALL expenses in the month, including categories that have
 * no line of their own. Months are calendar months of the transaction date.
 */

export type ProgressDTO = {
  limit: string;
  spent: string;
  /** Negative when over the limit. */
  remaining: string;
  percent: number;
  status: BudgetStatus;
};

export type BudgetDTO = {
  id: string;
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  archived: boolean;
  /** Everything spent in the month, with or without a limit. */
  totalSpent: string;
  overall: ProgressDTO | null;
  lines: (ProgressDTO & { categoryId: string; categoryName: string; categoryArchived: boolean })[];
};

const MAX_BUDGETS_LISTED = 60;
const cur = DEFAULT_CURRENCY;

const toProgress = (spent: bigint, limit: bigint): ProgressDTO => {
  const p = budgetProgress(spent, limit);
  return {
    limit: minorToDecimal(p.limit, cur),
    spent: minorToDecimal(p.spent, cur),
    remaining: minorToDecimal(p.remaining, cur),
    percent: p.percent,
    status: p.status,
  };
};

type BudgetRow = typeof budget.$inferSelect;

/** One grouped query covers every budget month at once (no per-budget queries). */
async function spendByMonth(userId: string, months: string[]) {
  const totals = new Map<string, bigint>();
  const perCategory = new Map<string, bigint>();
  if (months.length === 0) return { totals, perCategory };
  const sorted = [...months].sort();
  const from = sorted[0];
  const to = lastOfMonth(sorted[sorted.length - 1]);
  const monthExpr = sql<string>`to_char(date_trunc('month', ${t.transactionDate}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ m: monthExpr, categoryId: t.categoryId, total: sql<string>`sum(${t.amount})` })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.kind, "expense"), sql`${t.transactionDate} between ${from} and ${to}`))
    .groupBy(monthExpr, t.categoryId);
  for (const r of rows) {
    const v = decimalToMinor(r.total, cur);
    totals.set(r.m, (totals.get(r.m) ?? 0n) + v);
    perCategory.set(`${r.m}|${r.categoryId}`, v);
  }
  return { totals, perCategory };
}

async function assemble(userId: string, rows: BudgetRow[]): Promise<BudgetDTO[]> {
  if (rows.length === 0) return [];
  const [lineRows, spend] = await Promise.all([
    db
      .select({
        budgetId: budgetLine.budgetId,
        categoryId: budgetLine.categoryId,
        limit: budgetLine.limit,
        categoryName: category.name,
        categoryArchivedAt: category.archivedAt,
      })
      .from(budgetLine)
      .innerJoin(category, eq(category.id, budgetLine.categoryId))
      .where(inArray(budgetLine.budgetId, rows.map((r) => r.id)))
      .orderBy(category.name),
    spendByMonth(userId, rows.map((r) => r.month)),
  ]);

  return rows.map((b) => {
    const total = spend.totals.get(b.month) ?? 0n;
    return {
      id: b.id,
      month: b.month,
      archived: b.archivedAt !== null,
      totalSpent: minorToDecimal(total, cur),
      overall: b.overallLimit ? toProgress(total, decimalToMinor(b.overallLimit, cur)) : null,
      lines: lineRows
        .filter((l) => l.budgetId === b.id)
        .map((l) => ({
          categoryId: l.categoryId,
          categoryName: l.categoryName,
          categoryArchived: l.categoryArchivedAt !== null,
          ...toProgress(spend.perCategory.get(`${b.month}|${l.categoryId}`) ?? 0n, decimalToMinor(l.limit, cur)),
        })),
    };
  });
}

export async function listBudgets(userId: string): Promise<BudgetDTO[]> {
  const rows = await db
    .select()
    .from(budget)
    .where(eq(budget.userId, userId))
    .orderBy(desc(budget.month), desc(budget.createdAt))
    .limit(MAX_BUDGETS_LISTED);
  return assemble(userId, rows);
}

export async function getBudget(userId: string, rawId: string): Promise<BudgetDTO> {
  const id = idSchema.parse(rawId);
  const [row] = await db.select().from(budget).where(and(eq(budget.id, id), eq(budget.userId, userId))).limit(1);
  if (!row) throw notFound("Budget");
  return (await assemble(userId, [row]))[0];
}

/** The active budget for a month (any day within it), or null. Used by the dashboard. */
export async function getActiveBudgetForMonth(userId: string, dayInMonth: string): Promise<BudgetDTO | null> {
  const month = dayInMonth.slice(0, 7) + "-01";
  const [row] = await db
    .select()
    .from(budget)
    .where(and(eq(budget.userId, userId), eq(budget.month, month), isNull(budget.archivedAt)))
    .limit(1);
  return row ? (await assemble(userId, [row]))[0] : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** New lines must point at the user's usable (own or system), non-archived EXPENSE categories. */
async function assertBudgetableCategories(tx: Tx, userId: string, ids: string[]) {
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: category.id, type: category.type, archivedAt: category.archivedAt })
    .from(category)
    .where(and(inArray(category.id, ids), or(isNull(category.userId), eq(category.userId, userId))));
  const byId = new Map(found.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) throw new AppError("VALIDATION", "Choose valid categories", { lines: "A category was not found" });
    if (c.type !== "expense") throw new AppError("VALIDATION", "Only expense categories can have a budget", { lines: "Choose expense categories" });
    if (c.archivedAt) throw new AppError("VALIDATION", "An archived category cannot be added", { lines: "A chosen category is archived" });
  }
}

const monthTaken = () =>
  new AppError("CONFLICT", "You already have an active budget for that month", { month: "A budget already exists for this month" });

export async function createBudget(userId: string, raw: CreateBudgetInput): Promise<string> {
  const input = createBudgetSchema.parse(raw);
  const month = monthToFirstDay(input.month)!;
  try {
    return await db.transaction(async (tx) => {
      await assertBudgetableCategories(tx, userId, input.lines.map((l) => l.categoryId));
      const [b] = await tx
        .insert(budget)
        .values({ userId, month, overallLimit: input.overallLimit ? minorToDecimal(parseAmount(input.overallLimit), cur) : null })
        .returning({ id: budget.id });
      if (input.lines.length) {
        await tx.insert(budgetLine).values(
          input.lines.map((l) => ({ budgetId: b.id, categoryId: l.categoryId, limit: minorToDecimal(parseAmount(l.limit), cur) })),
        );
      }
      return b.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw monthTaken();
    throw e;
  }
}

export async function updateBudget(userId: string, rawId: string, raw: UpdateBudgetInput): Promise<void> {
  const id = idSchema.parse(rawId);
  const input = updateBudgetSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(budget)
      .where(and(eq(budget.id, id), eq(budget.userId, userId)))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Budget");
    if (current.archivedAt) throw new AppError("CONFLICT", "Archived budgets cannot be edited");

    // Categories that already have a line may stay even if archived since; only newly added ones are checked.
    const existing = new Set(
      (await tx.select({ c: budgetLine.categoryId }).from(budgetLine).where(eq(budgetLine.budgetId, id))).map((r) => r.c),
    );
    await assertBudgetableCategories(tx, userId, input.lines.map((l) => l.categoryId).filter((c) => !existing.has(c)));

    await tx.delete(budgetLine).where(eq(budgetLine.budgetId, id));
    if (input.lines.length) {
      await tx.insert(budgetLine).values(
        input.lines.map((l) => ({ budgetId: id, categoryId: l.categoryId, limit: minorToDecimal(parseAmount(l.limit), cur) })),
      );
    }
    await tx
      .update(budget)
      .set({ overallLimit: input.overallLimit ? minorToDecimal(parseAmount(input.overallLimit), cur) : null })
      .where(eq(budget.id, id));
  });
}

export async function archiveBudget(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  const done = await db
    .update(budget)
    .set({ archivedAt: new Date() })
    .where(and(eq(budget.id, id), eq(budget.userId, userId), isNull(budget.archivedAt)))
    .returning({ id: budget.id });
  if (done.length === 0) {
    const [row] = await db.select({ id: budget.id }).from(budget).where(and(eq(budget.id, id), eq(budget.userId, userId)));
    if (!row) throw notFound("Budget");
  }
}

