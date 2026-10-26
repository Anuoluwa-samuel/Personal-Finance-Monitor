import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv } from "@/server/domain/csv-parse";
import { toCsv } from "@/server/domain/csv";

describe("parseCsv", () => {
  it("parses simple rows with LF, CRLF and CR endings", () => {
    const want = [["a", "b"], ["1", "2"]];
    expect(parseCsv("a,b\n1,2\n")).toEqual(want);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual(want);
    expect(parseCsv("a,b\r1,2")).toEqual(want);
  });
  it("strips a BOM and skips blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quotes, escaped quotes, commas and newlines inside quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nnext"\n')).toEqual([["a", "b"], ["x, y", 'say "hi"\nnext']]);
  });
  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsv("a,b,c\n1,,\n,,")).toEqual([["a", "b", "c"], ["1", "", ""], ["", "", ""]]);
    expect(parseCsv('a\n""\n')).toEqual([["a"], [""]]);
  });
  it("never evaluates formulas: they are plain strings", () => {
    expect(parseCsv("a\n=1+1\n@SUM(A1)")).toEqual([["a"], ["=1+1"], ["@SUM(A1)"]]);
  });
  it("rejects malformed quoting and binary data", () => {
    expect(() => parseCsv('a\n"never closed')).toThrow(CsvParseError);
    expect(() => parseCsv('a\nx"y"')).toThrow(CsvParseError);
    expect(() => parseCsv('a\n"x"y')).toThrow(CsvParseError);
    expect(() => parseCsv("a\n\u0000\u0001")).toThrow(CsvParseError);
  });
  it("reports the line of the problem", () => {
    try {
      parseCsv('a\n1\n"oops');
    } catch (e) {
      expect((e as CsvParseError).line).toBe(3);
    }
  });
  it("is the exact inverse of toCsv for awkward text", () => {
    const rows = [["plain", 'with "quotes"', "multi\nline", "comma, here", "", "₦ café"]];
    const out = toCsv(["a", "b", "c", "d", "e", "f"], rows, new Set());
    expect(parseCsv(out)).toEqual([["a", "b", "c", "d", "e", "f"], ...rows]);
  });
});
