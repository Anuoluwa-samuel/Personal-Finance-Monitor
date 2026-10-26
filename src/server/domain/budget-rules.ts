import { percentOf } from "./money";

/**
 * Budget progress rules (all amounts are BigInt minor units).
 * - spent counts EXPENSE transactions only; income, including refunds recorded as income, never reduces it.
 * - "approaching" starts at 80% of the limit; "reached" is exactly 100%; "over" is anything above.
 * - remaining goes negative when over, so the overspend is visible.
 */
export type BudgetStatus = "ok" | "approaching" | "reached" | "over";

export const APPROACHING_PERCENT = 80;

export type Progress = {
  limit: bigint;
  spent: bigint;
  remaining: bigint;
  /** Truncated to 2 dp; may exceed 100. */
  percent: number;
  status: BudgetStatus;
};

export function budgetProgress(spent: bigint, limit: bigint): Progress {
  if (limit <= 0n) throw new RangeError("Budget limit must be positive");
  const percent = percentOf(spent < 0n ? 0n : spent, limit);
  const status: BudgetStatus = spent > limit ? "over" : spent === limit ? "reached" : percent >= APPROACHING_PERCENT ? "approaching" : "ok";
  return { limit, spent, remaining: limit - spent, percent, status };
}

/** "2025-03" -> "2025-03-01"; null if not a real month in the supported range. */
export function monthToFirstDay(value: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? `${value}-01` : null;
}
