import { describe, expect, it } from "vitest";
import { isInSupportedRange, isValidCalendarDate } from "@/server/domain/dates";

describe("isValidCalendarDate", () => {
  it.each(["2024-02-29", "2000-02-29", "2025-12-31", "2025-01-01"])("accepts %s", (d) => {
    expect(isValidCalendarDate(d)).toBe(true);
  });
  it.each(["2025-02-29", "2100-02-29", "2025-13-01", "2025-00-10", "2025-04-31", "2025-1-1", "25-01-01", "2025-01-01T00:00:00Z", ""])(
    "rejects %j",
    (d) => {
      expect(isValidCalendarDate(d)).toBe(false);
    },
  );
});

describe("isInSupportedRange", () => {
  it("bounds", () => {
    expect(isInSupportedRange("1999-12-31")).toBe(false);
    expect(isInSupportedRange("2000-01-01")).toBe(true);
    expect(isInSupportedRange("2100-12-31")).toBe(true);
    expect(isInSupportedRange("2101-01-01")).toBe(false);
  });
});
