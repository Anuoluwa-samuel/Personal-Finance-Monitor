import { describe, expect, it } from "vitest";
import { goalProgress } from "@/server/domain/goal-rules";
import { parseAmount, parseAmountOrZero } from "@/server/domain/money";

const m = parseAmount;

describe("goalProgress", () => {
  it("adds the starting amount to contributions", () => {
    expect(goalProgress(m("100"), m("150.50"), m("1000"))).toMatchObject({ saved: m("250.50"), remaining: m("749.50"), percent: 25.05, reached: false });
  });
  it("is empty at the start", () => {
    expect(goalProgress(0n, 0n, m("500"))).toMatchObject({ saved: 0n, remaining: m("500"), percent: 0, reached: false });
  });
  it("is reached exactly at the target with nothing remaining", () => {
    expect(goalProgress(m("400"), m("100"), m("500"))).toMatchObject({ remaining: 0n, percent: 100, reached: true });
  });
  it("never reports a negative remainder, even if data overshoots", () => {
    expect(goalProgress(0n, m("600"), m("500"))).toMatchObject({ remaining: 0n, reached: true });
  });
  it("is exact with fractions", () => {
    expect(goalProgress(0n, m("0.1") + m("0.2"), m("0.3"))).toMatchObject({ reached: true, percent: 100 });
  });
  it("rejects a non-positive target", () => {
    expect(() => goalProgress(0n, 0n, 0n)).toThrow(RangeError);
  });
});

describe("parseAmountOrZero", () => {
  it("treats blank and zero as zero", () => {
    expect(parseAmountOrZero("")).toBe(0n);
    expect(parseAmountOrZero("  ")).toBe(0n);
    expect(parseAmountOrZero("0")).toBe(0n);
    expect(parseAmountOrZero("0.00")).toBe(0n);
  });
  it("still parses and rejects like parseAmount otherwise", () => {
    expect(parseAmountOrZero("12.5")).toBe(1250n);
    expect(() => parseAmountOrZero("-1")).toThrow();
    expect(() => parseAmountOrZero("1.234")).toThrow();
    expect(() => parseAmountOrZero("abc")).toThrow();
  });
});
