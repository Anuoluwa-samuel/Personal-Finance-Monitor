/** Calendar-date helpers. Transaction dates are plain "YYYY-MM-DD" days, not instants. */

export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2100-12-31";

/** True only for real calendar dates in strict YYYY-MM-DD form (rejects 2025-02-30, 2025-13-01). */
export function isValidCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isInSupportedRange(value: string): boolean {
  return value >= MIN_DATE && value <= MAX_DATE; // ISO dates sort lexicographically
}
