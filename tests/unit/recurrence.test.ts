import { describe, expect, it } from "vitest";
import { dueOccurrences, firstIndexOnOrAfter, nextDueDate, nthOccurrence } from "@/server/domain/recurrence";

describe("nthOccurrence", () => {
  it("weekly and every-N-weeks", () => {
    expect(nthOccurrence("2025-01-01", "weekly", 1, 0)).toBe("2025-01-01");
    expect(nthOccurrence("2025-01-01", "weekly", 1, 3)).toBe("2025-01-22");
    expect(nthOccurrence("2025-01-01", "weekly", 2, 2)).toBe("2025-01-29");
  });
  it("monthly keeps the anchor day and clamps without drifting", () => {
    const seq = [0, 1, 2, 3, 4].map((k) => nthOccurrence("2025-01-31", "monthly", 1, k));
    expect(seq).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"]);
  });
  it("monthly handles leap years and year boundaries", () => {
    expect(nthOccurrence("2024-01-31", "monthly", 1, 1)).toBe("2024-02-29");
    expect(nthOccurrence("2025-11-15", "monthly", 1, 3)).toBe("2026-02-15");
    expect(nthOccurrence("2025-01-15", "monthly", 3, 5)).toBe("2026-04-15");
  });
  it("yearly clamps 29 Feb in non-leap years and returns in leap years", () => {
    expect(nthOccurrence("2024-02-29", "yearly", 1, 1)).toBe("2025-02-28");
    expect(nthOccurrence("2024-02-29", "yearly", 1, 4)).toBe("2028-02-29");
    expect(nthOccurrence("2025-06-10", "yearly", 2, 3)).toBe("2031-06-10");
  });
  it("rejects invalid inputs", () => {
    expect(() => nthOccurrence("2025-01-01", "weekly", 0, 0)).toThrow(RangeError);
    expect(() => nthOccurrence("2025-01-01", "weekly", 1, -1)).toThrow(RangeError);
  });
});

describe("dueOccurrences", () => {
  const base = { startDate: "2025-01-31", endDate: null, frequency: "monthly" as const, intervalCount: 1, nextIndex: 0 };
  it("returns nothing before the start date", () => {
    expect(dueOccurrences(base, "2025-01-30")).toEqual({ dates: [], nextIndex: 0, finished: false });
  });
  it("includes today and resumes after the last generated index", () => {
    expect(dueOccurrences(base, "2025-03-31")).toMatchObject({ dates: ["2025-01-31", "2025-02-28", "2025-03-31"], nextIndex: 3 });
    expect(dueOccurrences({ ...base, nextIndex: 3 }, "2025-03-31").dates).toEqual([]);
    expect(dueOccurrences({ ...base, nextIndex: 3 }, "2025-04-30").dates).toEqual(["2025-04-30"]);
  });
  it("stops at the end date and reports finished", () => {
    const r = dueOccurrences({ ...base, endDate: "2025-02-28" }, "2025-12-31");
    expect(r).toMatchObject({ dates: ["2025-01-31", "2025-02-28"], finished: true });
  });
  it("caps a long catch-up and continues on the next run", () => {
    const weekly = { ...base, frequency: "weekly" as const, startDate: "2024-01-01" };
    const first = dueOccurrences(weekly, "2025-12-31", 10);
    expect(first.dates).toHaveLength(10);
    expect(dueOccurrences({ ...weekly, nextIndex: first.nextIndex }, "2025-12-31", 10).dates[0]).toBe("2024-03-11");
  });
});

describe("resume and next due", () => {
  const rule = { startDate: "2025-01-01", endDate: null, frequency: "monthly" as const, intervalCount: 1 };
  it("skips dates missed while paused", () => {
    expect(firstIndexOnOrAfter(rule, "2025-04-10", 1)).toBe(4); // next is 1 May
    expect(firstIndexOnOrAfter(rule, "2025-04-01", 1)).toBe(3); // 1 Apr itself still counts
  });
  it("reports the next due date, or null once ended", () => {
    expect(nextDueDate({ ...rule, nextIndex: 2 })).toBe("2025-03-01");
    expect(nextDueDate({ ...rule, endDate: "2025-02-15", nextIndex: 2 })).toBeNull();
  });
});
