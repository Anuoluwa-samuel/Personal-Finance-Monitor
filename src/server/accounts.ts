import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { moneyAccount } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  createAccountSchema,
  updateAccountSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "@/validators/account";
import { idSchema } from "@/validators/transaction";
import { isUniqueViolation } from "./categories";
import { DEFAULT_CURRENCY, decimalToMinor, minorToDecimal, parseAmountOrZero } from "./domain/money";

/**
 * Account balance = opening balance + income - expenses recorded against the account (all time). Transactions with
 * no account are not part of any account's balance but still count in the overall recorded balance. Archived accounts
 * keep their history and still count towards the overall balance. Max 20 accounts per user.
 */
export const MAX_ACCOUNTS = 20;
const cur = DEFAULT_CURRENCY;

export type AccountDTO = {
  id: string;
  name: string;
  openingBalance: string;
  /** Opening balance + recorded income - recorded expenses for this account. May be negative. */
  balance: string;
  archived: boolean;
  transactionCount: number;
};

const dup = () => new AppError("CONFLICT", "You already have an account with that name", { name: "That name is already used" });

export async function listAccounts(userId: string): Promise<AccountDTO[]> {
  // Written out in full: Drizzle drops table prefixes in single-table selects, which would break the subqueries.
  const net = sql<string>`(select coalesce(sum(case when t.kind = 'income' then t.amount else -t.amount end), 0) from transactions t where t.account_id = "money_account"."id" and t.user_id = "money_account"."user_id")`;
  const n = sql<number>`(select count(*)::int from transactions t where t.account_id = "money_account"."id" and t.user_id = "money_account"."user_id")`;
  const rows = await db
    .select({ a: moneyAccount, net, n })
    .from(moneyAccount)
    .where(eq(moneyAccount.userId, userId))
    .orderBy(asc(moneyAccount.name));
  return rows.map(({ a, net, n }) => ({
    id: a.id,
    name: a.name,
    openingBalance: minorToDecimal(decimalToMinor(a.openingBalance, cur), cur),
    balance: minorToDecimal(decimalToMinor(a.openingBalance, cur) + decimalToMinor(net, cur), cur),
    archived: a.archivedAt !== null,
    transactionCount: n,
  }));
}

export async function createAccount(userId: string, raw: CreateAccountInput): Promise<string> {
  const input = createAccountSchema.parse(raw);
  const [{ c }] = await db.select({ c: count() }).from(moneyAccount).where(eq(moneyAccount.userId, userId));
  if (c >= MAX_ACCOUNTS) throw new AppError("CONFLICT", `You can have up to ${MAX_ACCOUNTS} accounts. Archive ones you no longer use.`);
  await assertNameFree(userId, input.name);
  try {
    const [row] = await db
      .insert(moneyAccount)
      .values({ userId, name: input.name, openingBalance: minorToDecimal(parseAmountOrZero(input.openingBalance), cur) })
      .returning({ id: moneyAccount.id });
    return row.id;
  } catch (e) {
    if (isUniqueViolation(e)) throw dup();
    throw e;
  }
}

async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const clash = await db
    .select({ id: moneyAccount.id })
    .from(moneyAccount)
    .where(and(eq(moneyAccount.userId, userId), sql`lower(${moneyAccount.name}) = lower(${name})`, exceptId ? ne(moneyAccount.id, exceptId) : undefined))
    .limit(1);
  if (clash.length) throw dup();
}

async function own(userId: string, rawId: string) {
  const id = idSchema.parse(rawId);
  const [a] = await db.select().from(moneyAccount).where(and(eq(moneyAccount.id, id), eq(moneyAccount.userId, userId))).limit(1);
  if (!a) throw notFound("Account");
  return a;
}

export async function updateAccount(userId: string, rawId: string, raw: UpdateAccountInput): Promise<void> {
  const patch = updateAccountSchema.parse(raw);
  const a = await own(userId, rawId);
  if (patch.name !== undefined) await assertNameFree(userId, patch.name, a.id);
  try {
    await db
      .update(moneyAccount)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.openingBalance !== undefined && { openingBalance: minorToDecimal(parseAmountOrZero(patch.openingBalance), cur) }),
      })
      .where(and(eq(moneyAccount.id, a.id), eq(moneyAccount.userId, userId)));
  } catch (e) {
    if (isUniqueViolation(e)) throw dup();
    throw e;
  }
}

export async function setAccountArchived(userId: string, rawId: string, archived: boolean): Promise<void> {
  const a = await own(userId, rawId);
  await db
    .update(moneyAccount)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(moneyAccount.id, a.id), eq(moneyAccount.userId, userId)));
}

/** Accounts a user may pick for a new transaction. */
export async function listUsableAccounts(userId: string) {
  return db
    .select({ id: moneyAccount.id, name: moneyAccount.name })
    .from(moneyAccount)
    .where(and(eq(moneyAccount.userId, userId), sql`${moneyAccount.archivedAt} is null`))
    .orderBy(asc(moneyAccount.name));
}
