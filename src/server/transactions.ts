import { and, asc, desc, eq, ilike, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { category, moneyAccount, transactions } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  createTransactionSchema,
  idSchema,
  listTransactionsSchema,
  updateTransactionSchema,
  type CreateTransactionInput,
  type ListTransactionsInput,
  type UpdateTransactionInput,
} from "@/validators/transaction";
import {
  DEFAULT_CURRENCY,
  decimalToMinor,
  minorToDecimal,
  parseAmount,
} from "./domain/money";

/**
 * Every function takes `userId` from the verified session (never from the
 * client) and scopes every query by it. Another user's row is reported as
 * "not found", never "forbidden", so ids cannot be probed.
 */

export type TransactionDTO = {
  id: string;
  kind: "income" | "expense";
  /** Canonical decimal string, e.g. "1500.50". */
  amount: string;
  currency: string;
  description: string;
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  accountName: string | null;
  transactionDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  t: typeof transactions.$inferSelect;
  categoryName: string;
  accountName: string | null;
};

const toDTO = ({ t, categoryName, accountName }: Row): TransactionDTO => ({
  id: t.id,
  kind: t.kind,
  amount: minorToDecimal(decimalToMinor(t.amount, DEFAULT_CURRENCY), DEFAULT_CURRENCY),
  currency: t.currency,
  description: t.description,
  categoryId: t.categoryId,
  categoryName,
  accountId: t.accountId,
  accountName,
  transactionDate: t.transactionDate,
  notes: t.notes,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A category is usable if it is a system category or the user's own, is not archived, and matches the kind. */
export async function assertUsableCategory(tx: Tx, userId: string, categoryId: string, kind: "income" | "expense") {
  const [c] = await tx
    .select({ type: category.type, archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, categoryId), or(isNull(category.userId), eq(category.userId, userId))))
    .limit(1);
  if (!c) throw new AppError("VALIDATION", "Choose a valid category", { categoryId: "Category not found" });
  if (c.type !== kind) {
    throw new AppError("VALIDATION", `That category is for ${c.type}, not ${kind}`, {
      categoryId: `Choose an ${kind} category`,
    });
  }
  if (c.archivedAt) {
    throw new AppError("VALIDATION", "That category is archived", { categoryId: "Category is archived" });
  }
}

/** An account is usable if it is the user's own and not archived. The composite FK also enforces ownership in the database. */
export async function assertUsableAccount(tx: Tx, userId: string, accountId: string | null) {
  if (!accountId) return;
  const [a] = await tx
    .select({ archivedAt: moneyAccount.archivedAt })
    .from(moneyAccount)
    .where(and(eq(moneyAccount.id, accountId), eq(moneyAccount.userId, userId)))
    .limit(1);
  if (!a) throw new AppError("VALIDATION", "Choose a valid account", { accountId: "Account not found" });
  if (a.archivedAt) throw new AppError("VALIDATION", "That account is archived", { accountId: "Account is archived" });
}

async function fetchOne(tx: Tx | typeof db, userId: string, id: string): Promise<Row | undefined> {
  const [row] = await tx
    .select({ t: transactions, categoryName: category.name, accountName: moneyAccount.name })
    .from(transactions)
    .innerJoin(category, eq(category.id, transactions.categoryId))
    .leftJoin(moneyAccount, eq(moneyAccount.id, transactions.accountId))
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  return row;
}

export async function createTransaction(userId: string, raw: CreateTransactionInput): Promise<TransactionDTO> {
  const input = createTransactionSchema.parse(raw);
  const amount = minorToDecimal(parseAmount(input.amount), DEFAULT_CURRENCY);

  return db.transaction(async (tx) => {
    await assertUsableCategory(tx, userId, input.categoryId, input.kind);
    await assertUsableAccount(tx, userId, input.accountId);

    const [inserted] = await tx
      .insert(transactions)
      .values({
        userId,
        kind: input.kind,
        amount,
        currency: DEFAULT_CURRENCY,
        description: input.description,
        categoryId: input.categoryId,
        accountId: input.accountId,
        transactionDate: input.transactionDate,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: transactions.id });

    if (inserted) {
      return toDTO((await fetchOne(tx, userId, inserted.id))!);
    }

    // Conflict on (user, idempotency key): a retry. Return the original if the payload matches.
    const [existing] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, input.idempotencyKey!)))
      .limit(1);
    const original = toDTO((await fetchOne(tx, userId, existing.id))!);
    const same =
      original.kind === input.kind &&
      original.amount === amount &&
      original.description === input.description &&
      original.categoryId === input.categoryId &&
      original.accountId === input.accountId &&
      original.transactionDate === input.transactionDate &&
      original.notes === input.notes;
    if (!same) {
      throw new AppError("CONFLICT", "This idempotency key was already used with different data");
    }
    return original;
  });
}

export async function getTransaction(userId: string, rawId: string): Promise<TransactionDTO> {
  const id = idSchema.parse(rawId);
  const row = await fetchOne(db, userId, id);
  if (!row) throw notFound("Transaction");
  return toDTO(row);
}

export async function updateTransaction(
  userId: string,
  rawId: string,
  raw: UpdateTransactionInput,
): Promise<TransactionDTO> {
  const id = idSchema.parse(rawId);
  const patch = updateTransactionSchema.parse(raw);

  return db.transaction(async (tx) => {
    // Lock the row so concurrent edits serialise.
    const [current] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Transaction");

    const kind = patch.kind ?? current.kind;
    const categoryId = patch.categoryId ?? current.categoryId;
    // Only re-validate the category when something that affects it changed.
    if (patch.kind !== undefined || patch.categoryId !== undefined) {
      await assertUsableCategory(tx, userId, categoryId, kind);
    }

    if (patch.accountId !== undefined && patch.accountId !== current.accountId) {
      await assertUsableAccount(tx, userId, patch.accountId);
    }

    await tx
      .update(transactions)
      .set({
        kind,
        categoryId,
        ...(patch.accountId !== undefined && { accountId: patch.accountId }),
        ...(patch.amount !== undefined && { amount: minorToDecimal(parseAmount(patch.amount), DEFAULT_CURRENCY) }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.transactionDate !== undefined && { transactionDate: patch.transactionDate }),
        ...(patch.notes !== undefined && { notes: patch.notes || null }),
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

    return toDTO((await fetchOne(tx, userId, id))!);
  });
}

export async function deleteTransaction(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  if (deleted.length === 0) throw notFound("Transaction");
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type TransactionPage = {
  items: TransactionDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listTransactions(userId: string, raw: ListTransactionsInput = {}): Promise<TransactionPage> {
  const f = listTransactionsSchema.parse(raw);

  const conditions: SQL[] = [eq(transactions.userId, userId)];
  if (f.q) conditions.push(ilike(transactions.description, `%${escapeLike(f.q)}%`));
  if (f.kind) conditions.push(eq(transactions.kind, f.kind));
  if (f.categoryId) conditions.push(eq(transactions.categoryId, f.categoryId));
  if (f.accountId) conditions.push(eq(transactions.accountId, f.accountId));
  if (f.from) conditions.push(gte(transactions.transactionDate, f.from));
  if (f.to) conditions.push(lte(transactions.transactionDate, f.to));
  const where = and(...conditions);

  const dir = f.dir === "asc" ? asc : desc;
  const primary = f.sort === "amount" ? dir(transactions.amount) : dir(transactions.transactionDate);
  // Tie-breakers make pagination stable when many rows share a date or amount.
  const order = [primary, desc(transactions.createdAt), desc(transactions.id)];

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ t: transactions, categoryName: category.name, accountName: moneyAccount.name })
      .from(transactions)
      .innerJoin(category, eq(category.id, transactions.categoryId))
      .leftJoin(moneyAccount, eq(moneyAccount.id, transactions.accountId))
      .where(where)
      .orderBy(...order)
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(transactions).where(where),
  ]);

  return { items: rows.map(toDTO), total: count, page: f.page, pageSize: f.pageSize };
}

/** Categories a user may pick from when recording a transaction. */
export async function listUsableCategories(userId: string) {
  return db
    .select({ id: category.id, name: category.name, type: category.type, isSystem: isNull(category.userId) })
    .from(category)
    .where(and(isNull(category.archivedAt), or(isNull(category.userId), eq(category.userId, userId))))
    .orderBy(asc(category.type), asc(category.name));
}
