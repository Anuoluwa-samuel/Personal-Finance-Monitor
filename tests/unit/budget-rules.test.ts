import { describe, expect, it } from "vitest";
import { budgetProgress, monthToFirstDay } from "@/server/domain/budget-rules";
import { parseAmount } from "@/server/domain/money";

const m = parseAmount;

describe("budgetProgress", () => {
  it("is ok below 80%", () => {
    expect(budgetProgress(m("79.99"), m("100"))).toMatchObject({ status: "ok", percent: 79.99, remaining: m("20.01") });
  });
  it("is approaching from exactly 80% up to just under the limit", () => {
    expect(budgetProgress(m("80"), m("100")).status).toBe("approaching");
    expect(budgetProgress(m("99.99"), m("100")).status).toBe("approaching");
  });
  it("is reached at exactly the limit, with nothing remaining", () => {
    expect(budgetProgress(m("100"), m("100"))).toMatchObject({ status: "reached", percent: 100, remaining: 0n });
  });
  it("is over above the limit and reports a negative remainder", () => {
    expect(budgetProgress(m("150.50"), m("100"))).toMatchObject({ status: "over", percent: 150.5, remaining: -5050n });
  });
  it("is ok with nothing spent", () => {
    expect(budgetProgress(0n, m("100"))).toMatchObject({ status: "ok", percent: 0 });
  });
  it("is exact on awkward fractions (no float drift)", () => {
    expect(budgetProgress(m("0.1") + m("0.2"), m("0.3"))).toMatchObject({ status: "reached", remaining: 0n });
  });
  it("rejects non-positive limits", () => {
    expect(() => budgetProgress(0n, 0n)).toThrow(RangeError);
  });
});

describe("monthToFirstDay", () => {
  it.each([["2025-03", "2025-03-01"], ["2000-01", "2000-01-01"], ["2100-12", "2100-12-01"]])("accepts %s", (i, o) => {
    expect(monthToFirstDay(i)).toBe(o);
  });
  it.each(["2025-13", "2025-00", "1999-12", "2101-01", "2025-3", "2025-03-01", ""])("rejects %j", (i) => {
    expect(monthToFirstDay(i)).toBeNull();
  });
});
