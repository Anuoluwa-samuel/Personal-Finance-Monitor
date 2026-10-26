import { isInSupportedRange, isValidCalendarDate } from "./dates";

/**
 * Reporting periods are inclusive ranges of calendar days ("YYYY-MM-DD").
 * Transactions are stored as plain calendar dates, so the user's timezone only
 * decides what "today" is. All other arithmetic is on calendar days in UTC,
 * which has no DST or midnight edge cases.
 */

export const PERIOD_PRESETS = ["this_month", "last_month", "last_30", "last_90", "this_year", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type Period = {
  preset: PeriodPreset;
  from: string;
  to: string;
  label: string;
};

export class PeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodError";
  }
}

export const MAX_CUSTOM_SPAN_DAYS = 3660; // ~10 years

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date at `now` in `tz`, e.g. 23:30 UTC on 31 Mar is 1 Apr in Africa/Lagos (UTC+1). */
export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const parts = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
};
const fmt = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function addDays(date: string, n: number): string {
  const { y, m, day } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86_400_000);
}

export const firstOfMonth = (date: string) => date.slice(0, 7) + "-01";

export function lastOfMonth(date: string): string {
  const { y, m } = parts(date);
  return fmt(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
}

/** First day of the month `n` months away from `date`'s month (n may be negative). */
export function addMonths(date: string, n: number): string {
  const { y, m } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
}

const monthName = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(date + "T00:00:00Z"),
  );
const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(date + "T00:00:00Z"),
  );

export type PeriodInput = { preset?: string; from?: string; to?: string };

export function resolvePeriod(input: PeriodInput, tz: string, now: Date = new Date()): Period {
  if (!isValidTimezone(tz)) throw new PeriodError("Unknown timezone");
  const preset = (input.preset ?? "this_month") as PeriodPreset;
  if (!PERIOD_PRESETS.includes(preset)) throw new PeriodError("Unknown period");
  const today = todayIn(tz, now);

  switch (preset) {
    case "this_month":
      return { preset, from: firstOfMonth(today), to: lastOfMonth(today), label: monthName(today) };
    case "last_month": {
      const start = addMonths(today, -1);
      return { preset, from: start, to: lastOfMonth(start), label: monthName(start) };
    }
    case "last_30":
      return { preset, from: addDays(today, -29), to: today, label: "Last 30 days" };
    case "last_90":
      return { preset, from: addDays(today, -89), to: today, label: "Last 90 days" };
    case "this_year": {
      const y = parts(today).y;
      return { preset, from: fmt(y, 1, 1), to: fmt(y, 12, 31), label: String(y) };
    }
    case "custom": {
      const { from, to } = input;
      if (!from || !to || !isValidCalendarDate(from) || !isValidCalendarDate(to)) {
        throw new PeriodError("Choose a valid start and end date");
      }
      if (!isInSupportedRange(from) || !isInSupportedRange(to)) throw new PeriodError("Dates must be between 2000 and 2100");
      if (from > to) throw new PeriodError("Start date must not be after end date");
      if (daysBetween(from, to) > MAX_CUSTOM_SPAN_DAYS) throw new PeriodError("Choose a range of 10 years or less");
      return { preset, from, to, label: `${dayName(from)} – ${dayName(to)}` };
    }
  }
}
