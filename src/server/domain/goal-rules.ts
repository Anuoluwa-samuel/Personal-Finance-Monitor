import { percentOf } from "./money";

/**
 * Savings-goal progress (BigInt minor units).
 * saved = starting amount + contributions. Contributions are planning records: they do not prove money moved,
 * and they are separate from income and expenses. The service keeps saved <= target (no overfunding).
 */
export type GoalProgress = {
  contributed: bigint;
  saved: bigint;
  remaining: bigint;
  /** Truncated to 2 dp. */
  percent: number;
  reached: boolean;
};

export function goalProgress(starting: bigint, contributed: bigint, target: bigint): GoalProgress {
  if (target <= 0n) throw new RangeError("Target must be positive");
  const saved = starting + contributed;
  const remaining = target > saved ? target - saved : 0n;
  return { contributed, saved, remaining, percent: percentOf(saved, target), reached: saved >= target };
}
