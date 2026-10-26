import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { savingsContribution as sc, savingsGoal as sg } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  contributionSchema,
  createGoalSchema,
  updateGoalSchema,
  type ContributionInput,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@/validators/savings";
import { idSchema } from "@/validators/transaction";
import { goalProgress } from "./domain/goal-rules";
import {
  DEFAULT_CURRENCY,
  decimalToMinor,
  formatMoney,
  minorToDecimal,
  parseAmount,
  parseAmountOrZero,
} from "./domain/money";

/**
 * Rules (also in the README):
 * - Contributions are planning records. They never change income, expenses, balance or budgets.
 * - saved = starting amount + contributions, and may never exceed the target (no overfunding): contributing locks
 *   the goal row, so concurrent requests cannot jointly overshoot.
 * - Only ACTIVE goals accept edits, contributions and contribution deletion. Completed goals can be reopened,
 *   archived goals restored. Deleting a goal permanently deletes its contributions.
 */
export const MAX_GOALS_PER_USER = 100;
const cur = DEFAULT_CURRENCY;

export type GoalDTO = {
  id: string;
  name: string;
  target: string;
  startingAmount: string;
  targetDate: string | null;
  status: "active" | "completed" | "archived";
  createdAt: string;
  completedAt: string | null;
  progress: { contributed: string; saved: string; remaining: string; percent: number; reached: boolean };
};

export type ContributionDTO = { id: string; amount: string; contributedOn: string; note: string | null; createdAt: string };

type GoalRow = typeof sg.$inferSelect;

const toGoal = (g: GoalRow, contributedStr: string): GoalDTO => {
  const p = goalProgress(decimalToMinor(g.startingAmount, cur), decimalToMinor(contributedStr, cur), decimalToMinor(g.target, cur));
  return {
    id: g.id,
    name: g.name,
    target: minorToDecimal(decimalToMinor(g.target, cur), cur),
    startingAmount: minorToDecimal(decimalToMinor(g.startingAmount, cur), cur),
    targetDate: g.targetDate,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    completedAt: g.completedAt?.toISOString() ?? null,
    progress: {
      contributed: minorToDecimal(p.contributed, cur),
      saved: minorToDecimal(p.saved, cur),
      remaining: minorToDecimal(p.remaining, cur),
      percent: p.percent,
      reached: p.reached,
    },
  };
};

// Written out in full: Drizzle drops table prefixes in single-table selects, which would break a correlated subquery.
const contributedSql = sql<string>`(select coalesce(sum(c.amount), 0) from savings_contribution c where c.goal_id = "savings_goal"."id")`;

export async function listGoals(userId: string): Promise<GoalDTO[]> {
  const rows = await db
    .select({ g: sg, contributed: contributedSql })
    .from(sg)
    .where(eq(sg.userId, userId))
    .orderBy(desc(sg.createdAt));
  return rows.map((r) => toGoal(r.g, r.contributed));
}

export async function getGoal(userId: string, rawId: string): Promise<GoalDTO & { contributions: ContributionDTO[] }> {
  const id = idSchema.parse(rawId);
  const [row] = await db
    .select({ g: sg, contributed: contributedSql })
    .from(sg)
    .where(and(eq(sg.id, id), eq(sg.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Savings goal");
  const list = await db
    .select()
    .from(sc)
    .where(and(eq(sc.goalId, id), eq(sc.userId, userId)))
    .orderBy(desc(sc.contributedOn), desc(sc.createdAt))
    .limit(200);
  return {
    ...toGoal(row.g, row.contributed),
    contributions: list.map((c) => ({
      id: c.id,
      amount: minorToDecimal(decimalToMinor(c.amount, cur), cur),
      contributedOn: c.contributedOn,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockGoal(tx: Tx, userId: string, id: string) {
  const [g] = await tx.select().from(sg).where(and(eq(sg.id, id), eq(sg.userId, userId))).for("update").limit(1);
  if (!g) throw notFound("Savings goal");
  return g;
}

async function contributedTotal(tx: Tx, goalId: string): Promise<bigint> {
  const [r] = await tx.select({ t: sql<string>`coalesce(sum(${sc.amount}), 0)` }).from(sc).where(eq(sc.goalId, goalId));
  return decimalToMinor(r.t, cur);
}

const needActive = (g: GoalRow) => {
  if (g.status !== "active") {
    throw new AppError("CONFLICT", g.status === "completed" ? "This goal is complete. Reopen it to make changes." : "This goal is archived. Restore it to make changes.");
  }
};

export async function createGoal(userId: string, raw: CreateGoalInput): Promise<string> {
  const input = createGoalSchema.parse(raw);
  const target = parseAmount(input.target);
  const starting = parseAmountOrZero(input.startingAmount);
  if (starting > target) {
    throw new AppError("VALIDATION", "The starting amount cannot be more than the target", { startingAmount: "Must not exceed the target" });
  }
  const [{ n }] = await db.select({ n: count() }).from(sg).where(eq(sg.userId, userId));
  if (n >= MAX_GOALS_PER_USER) throw new AppError("CONFLICT", `You can have up to ${MAX_GOALS_PER_USER} savings goals. Delete some you no longer need.`);
  const [row] = await db
    .insert(sg)
    .values({
      userId,
      name: input.name,
      target: minorToDecimal(target, cur),
      startingAmount: minorToDecimal(starting, cur),
      targetDate: input.targetDate,
      currency: cur,
    })
    .returning({ id: sg.id });
  return row.id;
}

export async function updateGoal(userId: string, rawId: string, raw: UpdateGoalInput): Promise<void> {
  const id = idSchema.parse(rawId);
  const patch = updateGoalSchema.parse(raw);
  await db.transaction(async (tx) => {
    const g = await lockGoal(tx, userId, id);
    needActive(g);
    const target = patch.target !== undefined ? parseAmount(patch.target) : decimalToMinor(g.target, cur);
    const starting = patch.startingAmount !== undefined ? parseAmountOrZero(patch.startingAmount) : decimalToMinor(g.startingAmount, cur);
    const contributed = await contributedTotal(tx, id);
    if (starting + contributed > target) {
      throw new AppError(
        "VALIDATION",
        `You have already saved ${formatMoney(starting + contributed)} towards this goal, which is more than that target.`,
        { [patch.target !== undefined ? "target" : "startingAmount"]: "Cannot be lower than the amount already saved" },
      );
    }
    await tx
      .update(sg)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.targetDate !== undefined && { targetDate: patch.targetDate }),
        target: minorToDecimal(target, cur),
        startingAmount: minorToDecimal(starting, cur),
      })
      .where(and(eq(sg.id, id), eq(sg.userId, userId)));
  });
}

export async function addContribution(userId: string, rawId: string, raw: ContributionInput): Promise<ContributionDTO> {
  const id = idSchema.parse(rawId);
  const input = contributionSchema.parse(raw);
  const amount = parseAmount(input.amount);

  return db.transaction(async (tx) => {
    const g = await lockGoal(tx, userId, id); // serialises concurrent contributions to this goal
    needActive(g);

    const saved = decimalToMinor(g.startingAmount, cur) + (await contributedTotal(tx, id));
    const room = decimalToMinor(g.target, cur) - saved;
    const toDTO = (c: typeof sc.$inferSelect): ContributionDTO => ({
      id: c.id,
      amount: minorToDecimal(decimalToMinor(c.amount, cur), cur),
      contributedOn: c.contributedOn,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    });

    // A retry of an already-recorded contribution returns the original, even if the goal is now full.
    if (input.idempotencyKey) {
      const [prior] = await tx.select().from(sc).where(and(eq(sc.userId, userId), eq(sc.idempotencyKey, input.idempotencyKey))).limit(1);
      if (prior) {
        const same = prior.goalId === id && decimalToMinor(prior.amount, cur) === amount && prior.contributedOn === input.contributedOn && prior.note === input.note;
        if (!same) throw new AppError("CONFLICT", "This idempotency key was already used with different data");
        return toDTO(prior);
      }
    }

    if (amount > room) {
      throw new AppError(
        "VALIDATION",
        room === 0n ? "This goal has already reached its target." : `Only ${formatMoney(room)} is left to reach the target.`,
        { amount: room === 0n ? "Target already reached" : `At most ${minorToDecimal(room, cur)}` },
      );
    }
    const [row] = await tx
      .insert(sc)
      .values({
        goalId: id,
        userId,
        amount: minorToDecimal(amount, cur),
        contributedOn: input.contributedOn,
        note: input.note,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();
    return toDTO(row);
  });
}

export async function deleteContribution(userId: string, rawContributionId: string): Promise<void> {
  const cid = idSchema.parse(rawContributionId);
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(sc).where(and(eq(sc.id, cid), eq(sc.userId, userId))).limit(1);
    if (!c) throw notFound("Contribution");
    const g = await lockGoal(tx, userId, c.goalId);
    needActive(g);
    await tx.delete(sc).where(and(eq(sc.id, cid), eq(sc.userId, userId)));
  });
}

type Status = "active" | "completed" | "archived";

async function transition(userId: string, rawId: string, from: Status[], to: Status) {
  const id = idSchema.parse(rawId);
  await db.transaction(async (tx) => {
    const g = await lockGoal(tx, userId, id);
    if (g.status === to) return; // idempotent
    if (!from.includes(g.status)) {
      throw new AppError("CONFLICT", `A ${g.status} goal cannot be moved to ${to}`);
    }
    await tx
      .update(sg)
      .set({ status: to, completedAt: to === "completed" ? new Date() : null })
      .where(and(eq(sg.id, id), eq(sg.userId, userId)));
  });
}

export const completeGoal = (u: string, id: string) => transition(u, id, ["active"], "completed");
export const reopenGoal = (u: string, id: string) => transition(u, id, ["completed"], "active");
export const archiveGoal = (u: string, id: string) => transition(u, id, ["active", "completed"], "archived");
export const restoreGoal = (u: string, id: string) => transition(u, id, ["archived"], "active");

export async function deleteGoal(userId: string, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  const done = await db.delete(sg).where(and(eq(sg.id, id), eq(sg.userId, userId))).returning({ id: sg.id });
  if (done.length === 0) throw notFound("Savings goal");
}

/** For the dashboard: contributions dated inside the period, plus the newest active goals with progress. */
export async function getSavingsSummary(userId: string, from: string, to: string) {
  const [[agg], goals] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${sc.amount}), 0)`, n: sql<number>`count(*)::int` })
      .from(sc)
      .where(and(eq(sc.userId, userId), sql`${sc.contributedOn} between ${from} and ${to}`)),
    db
      .select({ g: sg, contributed: contributedSql })
      .from(sg)
      .where(and(eq(sg.userId, userId), inArray(sg.status, ["active"])))
      .orderBy(desc(sg.createdAt))
      .limit(3),
  ]);
  return {
    contributedInPeriod: minorToDecimal(decimalToMinor(agg.total, cur), cur),
    contributionCount: agg.n,
    activeGoals: goals.map((r) => toGoal(r.g, r.contributed)),
  };
}
