import { describe, expect, it } from "vitest";
import {
  PeriodError,
  addDays,
  addMonths,
  daysBetween,
  lastOfMonth,
  resolvePeriod,
  todayIn,
} from "@/server/domain/periods";

const at = (iso: string) => new Date(iso);

describe("todayIn (timezone decides the calendar day)", () => {
  it("rolls over earlier in Lagos (UTC+1) than in UTC", () => {
    const now = at("2025-03-31T23:30:00Z");
    expect(todayIn("UTC", now)).toBe("2025-03-31");
    expect(todayIn("Africa/Lagos", now)).toBe("2025-04-01");
  });
  it("lags behind UTC in the Americas", () => {
    expect(todayIn("America/Los_Angeles", at("2025-04-01T03:00:00Z"))).toBe("2025-03-31");
  });
  it("handles year boundary", () => {
    expect(todayIn("Africa/Lagos", at("2024-12-31T23:59:59Z"))).toBe("2025-01-01");
  });
});

describe("calendar arithmetic", () => {
  it("handles leap years", () => {
    expect(lastOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(lastOfMonth("2025-02-10")).toBe("2025-02-28");
    expect(lastOfMonth("2100-02-10")).toBe("2100-02-28"); // 2100 is not a leap year
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-01");
    expect(addMonths("2025-01-15", -1)).toBe("2024-12-01");
    expect(addMonths("2025-03-15", -11)).toBe("2024-04-01");
  });
  it("counts days across DST-free calendar days", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-01-01", "2025-12-31")).toBe(364);
  });
});

describe("resolvePeriod", () => {
  const now = at("2025-03-10T12:00:00Z");
  const tz = "Africa/Lagos";

  it("this_month and last_month", () => {
    expect(resolvePeriod({ preset: "this_month" }, tz, now)).toMatchObject({ from: "2025-03-01", to: "2025-03-31" });
    expect(resolvePeriod({ preset: "last_month" }, tz, now)).toMatchObject({ from: "2025-02-01", to: "2025-02-28" });
  });
  it("defaults to this_month", () => {
    expect(resolvePeriod({}, tz, now).preset).toBe("this_month");
  });
  it("last_month across a year boundary and leap February", () => {
    expect(resolvePeriod({ preset: "last_month" }, tz, at("2025-01-15T12:00:00Z"))).toMatchObject({
      from: "2024-12-01",
      to: "2024-12-31",
    });
    expect(resolvePeriod({ preset: "last_month" }, tz, at("2024-03-15T12:00:00Z"))).toMatchObject({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
  it("last_30 and last_90 are inclusive of today and span exactly N days", () => {
    const p30 = resolvePeriod({ preset: "last_30" }, tz, now);
    expect(p30).toMatchObject({ from: "2025-02-09", to: "2025-03-10" });
    expect(daysBetween(p30.from, p30.to) + 1).toBe(30);
    const p90 = resolvePeriod({ preset: "last_90" }, tz, now);
    expect(daysBetween(p90.from, p90.to) + 1).toBe(90);
  });
  it("this_year", () => {
    expect(resolvePeriod({ preset: "this_year" }, tz, now)).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("uses the user's timezone for 'today' at month end", () => {
    const edge = at("2025-03-31T23:30:00Z");
    expect(resolvePeriod({ preset: "this_month" }, "Africa/Lagos", edge)).toMatchObject({ from: "2025-04-01" });
    expect(resolvePeriod({ preset: "this_month" }, "UTC", edge)).toMatchObject({ from: "2025-03-01" });
  });
  it("accepts a valid custom range, inclusive", () => {
    expect(resolvePeriod({ preset: "custom", from: "2025-01-01", to: "2025-01-01" }, tz, now)).toMatchObject({
      from: "2025-01-01",
      to: "2025-01-01",
    });
  });
  it.each([
    [{ preset: "custom" }],
    [{ preset: "custom", from: "2025-02-30", to: "2025-03-01" }],
    [{ preset: "custom", from: "2025-03-02", to: "2025-03-01" }],
    [{ preset: "custom", from: "1999-01-01", to: "2025-03-01" }],
    [{ preset: "custom", from: "2000-01-01", to: "2020-01-01" }],
    [{ preset: "bogus" }],
  ])("rejects %j", (input) => {
    expect(() => resolvePeriod(input, tz, now)).toThrow(PeriodError);
  });
  it("rejects unknown timezones", () => {
    expect(() => resolvePeriod({}, "Mars/Olympus", now)).toThrow(PeriodError);
  });
});
