import { describe, expect, it } from "vitest";
import {
  MoneyError,
  decimalToMinor,
  formatMoney,
  minorToDecimal,
  parseAmount,
  percentOf,
  sumMinor,
} from "@/server/domain/money";

describe("parseAmount", () => {
  it.each([
    ["1500", 150000n],
    ["1500.5", 150050n],
    ["1,500.50", 150050n],
    ["0.05", 5n],
    ["0.01", 1n],
    [" 20 ", 2000n],
    ["999999999999.99", 99999999999999n],
  ])("parses %s", (input, minor) => {
    expect(parseAmount(input)).toBe(minor);
  });

  it.each(["", "abc", "0", "0.00", "-5", "+5", "1e3", "1.234", "1..2", ".5", "5.", "NaN", "Infinity", "1 000", "1000000000000"])(
    "rejects %j",
    (input) => {
      expect(() => parseAmount(input)).toThrow(MoneyError);
    },
  );

  it("never rounds: 0.1 + 0.2 style inputs stay exact", () => {
    expect(sumMinor([parseAmount("0.1"), parseAmount("0.2")])).toBe(parseAmount("0.3"));
  });
});

describe("minor/decimal conversion", () => {
  it("round-trips", () => {
    for (const s of ["0.01", "0.10", "1.00", "1234.56", "99999999999.99"]) {
      expect(minorToDecimal(parseAmount(s))).toBe(s);
    }
  });

  it("reads Postgres NUMERIC(18,4) strings", () => {
    expect(decimalToMinor("1234.5000")).toBe(123450n);
    expect(minorToDecimal(decimalToMinor("10.0000"))).toBe("10.00");
  });

  it("refuses stored values finer than the currency allows", () => {
    expect(() => decimalToMinor("1.2350")).toThrow(MoneyError);
  });

  it("formats negatives", () => {
    expect(minorToDecimal(-5n)).toBe("-0.05");
  });
});

describe("sums and percentages", () => {
  it("sums large values without precision loss", () => {
    const big = parseAmount("999999999999.99");
    expect(sumMinor([big, big, 1n])).toBe(199999999999999n);
  });

  it("computes utilisation with truncation", () => {
    expect(percentOf(1n, 3n)).toBe(33.33);
    expect(percentOf(150n, 100n)).toBe(150);
    expect(percentOf(5n, 0n)).toBe(0);
  });
});

describe("formatMoney", () => {
  it("formats NGN with grouping and two decimals", () => {
    const out = formatMoney(123456789n);
    expect(out).toContain("1,234,567.89");
    expect(out).toMatch(/₦|NGN/);
  });
});
