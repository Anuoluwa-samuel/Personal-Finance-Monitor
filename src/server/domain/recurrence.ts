import { addDays, addMonths, lastOfMonth } from "./periods";

/**
 * Schedule maths for recurring rules. The k-th occurrence is computed FROM THE START DATE, never by adding to the
 * previous one, so a rule starting on 31 Jan gives 31 Jan, 28 Feb, 31 Mar (not 31 Jan, 28 Feb, 28 Mar).
 * Months and years clamp to the last day of a shorter month (29 Feb -> 28 Feb in a non-leap year).
 */
export type Frequency = "weekly" | "monthly" | "yearly";

export function nthOccurrence(start: string, frequency: Frequency, interval: number, k: number): string {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("Occurrence index must be a non-negative integer");
  if (!Number.isInteger(interval) || interval < 1) throw new RangeError("Interval must be a positive integer");
  if (frequency === "weekly") return addDays(start, 7 * interval * k);
  const months = frequency === "monthly" ? interval * k : 12 * interval * k;
  const firstOfTarget = addMonths(start, months);
  const day = Math.min(Number(start.slice(8, 10)), Number(lastOfMonth(firstOfTarget).slice(8, 10)));
  return firstOfTarget.slice(0, 8) + String(day).padStart(2, "0");
}

export type RuleSchedule = { startDate: string; endDate: string | null; frequency: Frequency; intervalCount: number; nextIndex: number };

/**
 * Occurrences that are due on or before `today` and not yet generated, oldest first, at most `cap` of them.
 * `nextIndex` in the result is where the next run resumes. `finished` is true once the end date has passed.
 */
export function dueOccurrences(rule: RuleSchedule, today: string, cap = 60) {
  const dates: string[] = [];
  let k = rule.nextIndex;
  let finished = false;
  while (dates.length < cap) {
    const d = nthOccurrence(rule.startDate, rule.frequency, rule.intervalCount, k);
    if (rule.endDate && d > rule.endDate) {
      finished = true;
      break;
    }
    if (d > today) break;
    dates.push(d);
    k++;
  }
  return { dates, nextIndex: k, finished };
}

/** The first index whose date is on or after `date`. Used when resuming a paused rule so missed dates are not back-filled. */
export function firstIndexOnOrAfter(rule: Omit<RuleSchedule, "nextIndex">, date: string, from = 0): number {
  let k = from;
  while (nthOccurrence(rule.startDate, rule.frequency, rule.intervalCount, k) < date) k++;
  return k;
}

export function nextDueDate(rule: RuleSchedule): string | null {
  const d = nthOccurrence(rule.startDate, rule.frequency, rule.intervalCount, rule.nextIndex);
  return rule.endDate && d > rule.endDate ? null : d;
}
