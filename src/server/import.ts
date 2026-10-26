import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { category, importBatch, moneyAccount, transactions, type StagedRow } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { idSchema } from "@/validators/transaction";
import { CsvParseError, parseCsv } from "./domain/csv-parse";
import { IMPORT_MAX_ROWS, readHeader, validateRows, type ImportRow, type RowError } from "./domain/import-rows";
import { DEFAULT_CURRENCY, minorToDecimal, parseAmount } from "./domain/money";

/**
 * Import flow (two steps, nothing is written to transactions until the user confirms):
 *  1. preview: parse + validate EVERYTHING. If any row is invalid nothing is staged; all errors are reported.
 *     Otherwise the server stages the validated rows (minus duplicates) in import_batch for one hour.
 *  2. confirm: the client sends only a batch id. All staged rows are inserted in ONE database transaction, so a
 *     failure leaves the user's records exactly as they were.
 * De-duplication: every row gets a deterministic key (user + date + type + amount + description + category + the
 * occurrence number among identical rows in the file) stored as transactions.idempotency_key. Importing the same
 * file again therefore skips rows that already exist, while two genuinely identical rows in one file are both kept.
 * Rows typed in by hand have no key, so they are NOT detected as duplicates (documented limitation).
 */

export const IMPORT_MAX_BYTES = 512 * 1024;
export const BATCH_TTL_MS = 60 * 60 * 1000;
const MAX_ERRORS_SHOWN = 50;
const SAMPLE_ROWS = 20;

const rowKey = (userId: string, r: ImportRow, occurrence: number) =>
  "imp-" +
  createHash("sha256")
    .update([userId, r.transactionDate, r.kind, r.amount, r.description, r.categoryId, ...(r.accountId ? [r.accountId] : []), occurrence].join("\u0000"))
    .digest("hex")
    .slice(0, 48);

export type ImportPreview =
  | { ok: false; message: string; errors: RowError[]; totalErrors: number }
  | {
      ok: true;
      batchId: string | null;
      newCount: number;
      duplicateCount: number;
      income: string;
      expense: string;
      from: string | null;
      to: string | null;
      sample: { line: number; kind: "income" | "expense"; amount: string; description: string; categoryName: string; transactionDate: string }[];
    };

export async function previewImport(userId: string, fileName: string, text: string): Promise<ImportPreview> {
  const fail = (message: string): ImportPreview => ({ ok: false, message, errors: [], totalErrors: 0 });

  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (e) {
    if (e instanceof CsvParseError) return fail(`The file is not valid CSV (line ${e.line}): ${e.message}.`);
    throw e;
  }
  if (table.length === 0) return fail("The file is empty.");
  const header = readHeader(table[0]);
  if ("error" in header) return fail(header.error);
  if (table.length === 1) return fail("The file has a header but no transactions.");
  if (table.length - 1 > IMPORT_MAX_ROWS) return fail(`The file has ${table.length - 1} rows; the limit is ${IMPORT_MAX_ROWS} per import. Split it into smaller files.`);

  const cats = await db
    .select({ id: category.id, name: category.name, type: category.type })
    .from(category)
    .where(and(isNull(category.archivedAt), or(isNull(category.userId), eq(category.userId, userId))));

  const accts = await db
    .select({ id: moneyAccount.id, name: moneyAccount.name })
    .from(moneyAccount)
    .where(and(eq(moneyAccount.userId, userId), isNull(moneyAccount.archivedAt)));

  const { rows, errors } = validateRows(table, header.index, cats, accts);
  if (errors.length) {
    return { ok: false, message: "Some rows have problems. Nothing was imported. Fix the file and upload it again.", errors: errors.slice(0, MAX_ERRORS_SHOWN), totalErrors: errors.length };
  }

  // Occurrence-numbered keys: identical rows within the file stay distinct, but re-imports line up exactly.
  const seen = new Map<string, number>();
  const keyed = rows.map((r) => {
    const base = [r.transactionDate, r.kind, r.amount, r.description, r.categoryId, r.accountId ?? ""].join("\u0000");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { row: r, key: rowKey(userId, r, n) };
  });

  const existing = new Set(
    (await db
      .select({ k: transactions.idempotencyKey })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.idempotencyKey, keyed.map((k) => k.key))))).map((r) => r.k),
  );
  const fresh = keyed.filter((k) => !existing.has(k.key));
  const duplicateCount = keyed.length - fresh.length;

  let income = 0n;
  let expense = 0n;
  for (const { row } of fresh) {
    if (row.kind === "income") income += parseAmount(row.amount);
    else expense += parseAmount(row.amount);
  }
  const dates = fresh.map((f) => f.row.transactionDate).sort();

  let batchId: string | null = null;
  if (fresh.length > 0) {
    // One live preview per user: drop expired and earlier uncommitted batches so staging cannot pile up.
    await db.delete(importBatch).where(and(eq(importBatch.userId, userId), or(isNull(importBatch.committedAt), lt(importBatch.expiresAt, new Date()))));
    const staged: StagedRow[] = fresh.map(({ row, key }) => ({
      key, kind: row.kind, amount: row.amount, description: row.description, categoryId: row.categoryId, accountId: row.accountId, transactionDate: row.transactionDate, notes: row.notes,
    }));
    const [b] = await db
      .insert(importBatch)
      .values({ userId, fileName: fileName.slice(0, 200), rows: staged, rowCount: staged.length, duplicateCount, expiresAt: new Date(Date.now() + BATCH_TTL_MS) })
      .returning({ id: importBatch.id });
    batchId = b.id;
  }

  return {
    ok: true,
    batchId,
    newCount: fresh.length,
    duplicateCount,
    income: minorToDecimal(income),
    expense: minorToDecimal(expense),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    sample: fresh.slice(0, SAMPLE_ROWS).map(({ row }) => ({
      line: row.line, kind: row.kind, amount: row.amount, description: row.description, categoryName: row.categoryName, transactionDate: row.transactionDate,
    })),
  };
}

/** Writes the staged rows in a single transaction. Idempotent: confirming twice never imports twice. */
export async function confirmImport(userId: string, rawBatchId: string): Promise<{ inserted: number; alreadyCommitted: boolean }> {
  const id = idSchema.parse(rawBatchId);
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select()
      .from(importBatch)
      .where(and(eq(importBatch.id, id), eq(importBatch.userId, userId)))
      .for("update")
      .limit(1);
    if (!b) throw notFound("Import preview");
    if (b.committedAt) return { inserted: b.rowCount, alreadyCommitted: true };
    if (b.expiresAt < new Date()) throw new AppError("CONFLICT", "This preview has expired. Upload the file again to review it.");

    let inserted = 0;
    for (let i = 0; i < b.rows.length; i += 500) {
      const chunk = b.rows.slice(i, i + 500).map((r) => ({
        userId,
        kind: r.kind,
        amount: minorToDecimal(parseAmount(r.amount)),
        currency: DEFAULT_CURRENCY,
        description: r.description,
        categoryId: r.categoryId,
        accountId: r.accountId ?? null,
        transactionDate: r.transactionDate,
        notes: r.notes,
        idempotencyKey: r.key,
      }));
      // A concurrent import of the same file may have inserted some keys already: skip those, never duplicate.
      const done = await tx.insert(transactions).values(chunk).onConflictDoNothing().returning({ id: transactions.id });
      inserted += done.length;
    }
    await tx.update(importBatch).set({ committedAt: new Date(), rows: [] }).where(eq(importBatch.id, id));
    return { inserted, alreadyCommitted: false };
  });
}

export async function discardImport(userId: string, rawBatchId: string): Promise<void> {
  const id = idSchema.parse(rawBatchId);
  await db.delete(importBatch).where(and(eq(importBatch.id, id), eq(importBatch.userId, userId), isNull(importBatch.committedAt)));
}
