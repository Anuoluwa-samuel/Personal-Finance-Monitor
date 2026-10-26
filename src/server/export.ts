import { and, asc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { category, moneyAccount, transactions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { listTransactionsSchema } from "@/validators/transaction";
import { toCsv } from "./domain/csv";
import { decimalToMinor, minorToDecimal } from "./domain/money";

export const EXPORT_ROW_LIMIT = 50_000;

export const EXPORT_HEADERS = ["Date", "Type", "Amount", "Currency", "Description", "Category", "Account", "Notes"] as const;
const TEXT_COLUMNS = new Set([4, 5, 6, 7]);

const exportFilters = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(["income", "expense"]).optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  from: listTransactionsSchema.shape.from,
  to: listTransactionsSchema.shape.to,
}).strict().refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Start date must not be after end date", path: ["from"] });

export type ExportFilters = z.input<typeof exportFilters>;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Exports ONLY the caller's own transactions matching the filters, oldest first. Refuses (rather than silently
 * truncating) when more than `limit` rows match, so a file is never quietly incomplete.
 */
export async function exportTransactionsCsv(userId: string, raw: ExportFilters = {}, limit = EXPORT_ROW_LIMIT) {
  const f = exportFilters.parse(raw);
  const conds: SQL[] = [eq(transactions.userId, userId)];
  if (f.q) conds.push(ilike(transactions.description, `%${escapeLike(f.q)}%`));
  if (f.kind) conds.push(eq(transactions.kind, f.kind));
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.accountId) conds.push(eq(transactions.accountId, f.accountId));
  if (f.from) conds.push(gte(transactions.transactionDate, f.from));
  if (f.to) conds.push(lte(transactions.transactionDate, f.to));
  const where = and(...conds);

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions).where(where);
  if (n > limit) {
    throw new AppError("VALIDATION", `Too many transactions to export at once (${n.toLocaleString("en-GB")}; the limit is ${limit.toLocaleString("en-GB")}). Choose a shorter date range.`);
  }

  const rows = await db
    .select({ t: transactions, categoryName: category.name, accountName: moneyAccount.name })
    .from(transactions)
    .innerJoin(category, eq(category.id, transactions.categoryId))
    .leftJoin(moneyAccount, eq(moneyAccount.id, transactions.accountId))
    .where(where)
    .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt), asc(transactions.id));

  const csv = toCsv(
    EXPORT_HEADERS,
    rows.map(({ t, categoryName, accountName }) => [
      t.transactionDate,
      t.kind,
      minorToDecimal(decimalToMinor(t.amount)),
      t.currency,
      t.description,
      categoryName,
      accountName ?? "",
      t.notes ?? "",
    ]),
    TEXT_COLUMNS,
  );
  const range = f.from || f.to ? `${f.from ?? "start"}_to_${f.to ?? "latest"}` : "all";
  return { csv, count: rows.length, filename: `ispentit-transactions-${range}.csv` };
}
