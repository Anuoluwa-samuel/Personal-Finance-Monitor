import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, recurringOccurrence as occ, recurringRule as rr, transactions, userPreferences } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  createRuleSchema,
  postOccurrenceSchema,
  updateRuleSchema,
  type CreateRuleInput,
  type PostOccurrenceInput,
  type UpdateRuleInput,
} from "@/validators/recurring";
import { idSchema } from "@/validators/transaction";
import { DEFAULT_CURRENCY, decimalToMinor, minorToDecimal, parseAmount } from "./domain/money";
import { isValidTimezone, todayIn } from "./domain/periods";
import { dueOccurrences, firstIndexOnOrAfter, nextDueDate, type Frequency } from "./domain/recurrence";
import { assertUsableAccount, assertUsableCategory } from "./transactions";

/**
 * Rules (also in the README):
 * - A rule only ever creates PLANNED occurrences. They are not transactions and are not counted in any total, budget
 *   or balance. Only confirming one creates a real transaction, so nothing is shown as paid because a date passed.
 * - Generation is idempotent (unique rule + date) and safe to run concurrently (row locks), by cron or on page load.
 * - Pausing stops generation. Resuming does NOT back-fill the dates missed while paused.
 * - Editing a rule changes future confirmations; occurrences already generated use the rule's values when confirmed.
 */
export const MAX_RULES_PER_USER = 50;
const GENERATION_CAP = 60;
const cur = DEFAULT_CURRENCY;

export type RuleDTO = {
  id: string;
  kind: "income" | "expense";
  amount: string;
  description: string;
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  status: "active" | "paused";
  nextDue: string | null;
  pendingCount: number;
};

export type PendingDTO = {
  id: string;
  ruleId: string;
  scheduledFor: string;
  kind: "income" | "expense";
  amount: string;
  description: string;
  categoryName: string;
};

export async function createRule(userId: string, raw: CreateRuleInput): Promise<string> {
  const input = createRuleSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(rr).where(eq(rr.userId, userId));
    if (n >= MAX_RULES_PER_USER) throw new AppError("CONFLICT", `You can have up to ${MAX_RULES_PER_USER} recurring rules.`);
    await assertUsableCategory(tx, userId, input.categoryId, input.kind);
    await assertUsableAccount(tx, userId, input.accountId);
    const [row] = await tx
      .insert(rr)
      .values({
        userId,
        kind: input.kind,
        amount: minorToDecimal(parseAmount(input.amount), cur),
        description: input.description,
        categoryId: input.categoryId,
        accountId: input.accountId,
        frequency: input.frequency,
        intervalCount: input.intervalCount,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .returning({ id: rr.id });
    return row.id;
  });
}

async function lockRule(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, id: string) {
  const [r] = await tx.select().from(rr).where(and(eq(rr.id, id), eq(rr.userId, userId))).for("update").limit(1);
  if (!r) throw notFound("Recurring rule");
  return r;
}

export async function updateRule(userId: string, rawId: string, raw: UpdateRuleInput): Promise<void> {
  const id = idSchema.parse(rawId);
  const patch = updateRuleSchema.parse(raw);
  await db.transaction(async (tx) => {
    const r = await lockRule(tx, userId, id);
    if (patch.categoryId !== undefined) await assertUsableCategory(tx, userId, patch.categoryId, r.kind);
    if (patch.accountId !== undefined && patch.accountId !== r.accountId) await assertUsableAccount(tx, userId, patch.accountId);
    if (patch.endDate && patch.endDate < r.startDate) {
      throw new AppError("VALIDATION", "End date must not be before the start date", { endDate: "Before the start date" });
    }
    await tx
      .update(rr)
      .set({
        ...(patch.amount !== undefined && { amount: minorToDecimal(parseAmount(patch.amount), cur) }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.accountId !== undefined && { accountId: patch.accountId }),
        ...(patch.endDate !== undefined && { endDate: patch.endDate }),
      })
      .where(eq(rr.id, id));
  });
}

export async function pauseRule(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  await db.transaction(async (tx) => {
    await lockRule(tx, userId, id);
    await tx.update(rr).set({ status: "paused" }).where(eq(rr.id, id));
  });
}

export async function resumeRule(userId: string, rawId: string, now: Date = new Date()): Promise<void> {
  const id = idSchema.parse(rawId);
  await db.transaction(async (tx) => {
    const r = await lockRule(tx, userId, id);
    if (r.status === "active") return;
    const tz = await timezoneOf(tx, userId);
    // Dates that fell due while paused are dropped, not back-filled.
    const nextIndex = firstIndexOnOrAfter(r, todayIn(tz, now), r.nextIndex);
    await tx.update(rr).set({ status: "active", nextIndex }).where(eq(rr.id, id));
  });
}

export async function deleteRule(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  const done = await db.delete(rr).where(and(eq(rr.id, id), eq(rr.userId, userId))).returning({ id: rr.id });
  if (done.length === 0) throw notFound("Recurring rule");
}

async function timezoneOf(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string): Promise<string> {
  const [p] = await tx.select({ tz: userPreferences.timezone }).from(userPreferences).where(eq(userPreferences.userId, userId));
  return p && isValidTimezone(p.tz) ? p.tz : "Africa/Lagos";
}

/**
 * Records planned occurrences for every active rule that is due. Idempotent and concurrency-safe: each rule is
 * handled in its own transaction holding a row lock (rules locked by another run are skipped), and the unique
 * (rule, date) key rejects duplicates. Returns how many occurrences were created.
 */
export async function generateOccurrences(opts: { userId?: string; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const candidates = await db
    .select({ id: rr.id, userId: rr.userId })
    .from(rr)
    .where(and(eq(rr.status, "active"), opts.userId ? eq(rr.userId, opts.userId) : undefined));

  let created = 0;
  for (const c of candidates) {
    created += await db.transaction(async (tx) => {
      const [r] = await tx.select().from(rr).where(and(eq(rr.id, c.id), eq(rr.status, "active"))).for("update", { skipLocked: true }).limit(1);
      if (!r) return 0;
      const today = todayIn(await timezoneOf(tx, r.userId), now);
      const due = dueOccurrences(r, today, GENERATION_CAP);
      if (due.dates.length === 0) return 0;
      const inserted = await tx
        .insert(occ)
        .values(due.dates.map((scheduledFor) => ({ ruleId: r.id, userId: r.userId, scheduledFor })))
        .onConflictDoNothing()
        .returning({ id: occ.id });
      await tx.update(rr).set({ nextIndex: due.nextIndex }).where(eq(rr.id, r.id));
      return inserted.length;
    });
  }
  return created;
}

export async function listRules(userId: string): Promise<RuleDTO[]> {
  const pending = sql<number>`(select count(*)::int from recurring_occurrence o where o.rule_id = "recurring_rule"."id" and o.status = 'pending')`;
  const rows = await db
    .select({ r: rr, categoryName: category.name, pending })
    .from(rr)
    .innerJoin(category, eq(category.id, rr.categoryId))
    .where(eq(rr.userId, userId))
    .orderBy(asc(rr.description));
  return rows.map(({ r, categoryName, pending }) => ({
    id: r.id,
    kind: r.kind,
    amount: minorToDecimal(decimalToMinor(r.amount, cur), cur),
    description: r.description,
    categoryId: r.categoryId,
    categoryName,
    accountId: r.accountId,
    frequency: r.frequency,
    intervalCount: r.intervalCount,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    nextDue: nextDueDate(r),
    pendingCount: pending,
  }));
}

export async function listPending(userId: string): Promise<PendingDTO[]> {
  const rows = await db
    .select({ o: occ, r: rr, categoryName: category.name })
    .from(occ)
    .innerJoin(rr, eq(rr.id, occ.ruleId))
    .innerJoin(category, eq(category.id, rr.categoryId))
    .where(and(eq(occ.userId, userId), eq(occ.status, "pending")))
    .orderBy(asc(occ.scheduledFor), asc(rr.description));
  return rows.map(({ o, r, categoryName }) => ({
    id: o.id,
    ruleId: r.id,
    scheduledFor: o.scheduledFor,
    kind: r.kind,
    amount: minorToDecimal(decimalToMinor(r.amount, cur), cur),
    description: r.description,
    categoryName,
  }));
}

export async function countPending(userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(occ).where(and(eq(occ.userId, userId), eq(occ.status, "pending")));
  return n;
}

/** Confirms an occurrence as really paid/received: creates the transaction and marks it posted, atomically and once. */
export async function postOccurrence(userId: string, rawId: string, raw: PostOccurrenceInput = {}): Promise<string> {
  const id = idSchema.parse(rawId);
  const input = postOccurrenceSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(occ).where(and(eq(occ.id, id), eq(occ.userId, userId))).for("update").limit(1);
    if (!o) throw notFound("Planned transaction");
    if (o.status === "posted" && o.transactionId) return o.transactionId; // idempotent
    if (o.status !== "pending") throw new AppError("CONFLICT", o.status === "skipped" ? "That occurrence was skipped." : "That occurrence was already confirmed.");

    const [r] = await tx.select().from(rr).where(eq(rr.id, o.ruleId)).limit(1);
    const amount = input.amount ? minorToDecimal(parseAmount(input.amount), cur) : minorToDecimal(decimalToMinor(r.amount, cur), cur);
    const [t] = await tx
      .insert(transactions)
      .values({
        userId,
        kind: r.kind,
        amount,
        currency: cur,
        description: r.description,
        categoryId: r.categoryId,
        accountId: r.accountId,
        transactionDate: input.transactionDate ?? o.scheduledFor,
        notes: null,
        idempotencyKey: `rec-${o.id}`,
      })
      .returning({ id: transactions.id });
    await tx.update(occ).set({ status: "posted", transactionId: t.id, resolvedAt: new Date() }).where(eq(occ.id, id));
    return t.id;
  });
}

export async function skipOccurrence(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(occ).where(and(eq(occ.id, id), eq(occ.userId, userId))).for("update").limit(1);
    if (!o) throw notFound("Planned transaction");
    if (o.status === "skipped") return;
    if (o.status === "posted") throw new AppError("CONFLICT", "That occurrence was already confirmed.");
    await tx.update(occ).set({ status: "skipped", resolvedAt: new Date() }).where(eq(occ.id, id));
  });
}

