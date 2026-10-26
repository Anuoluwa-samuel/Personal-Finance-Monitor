import { describe, expect, it } from "vitest";
import { escapeField, neutraliseFormula, restoreFormula, toCsv } from "@/server/domain/csv";

describe("escapeField", () => {
  it("leaves plain text alone", () => {
    expect(escapeField("Lunch at work")).toBe("Lunch at work");
  });
  it("quotes commas, quotes and newlines, doubling inner quotes", () => {
    expect(escapeField("a,b")).toBe('"a,b"');
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("formula injection", () => {
  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\t=1", "\r=1", "  =1+1", " \t+1"])("neutralises %j", (v) => {
    expect(neutraliseFormula(v)).toBe(`'${v}`);
  });
  it.each(["Lunch", "a=b", "x-y", "100%", "", " plain", "'quoted"])("leaves %j alone", (v) => {
    expect(neutraliseFormula(v)).toBe(v);
  });
  it("restoreFormula reverses neutraliseFormula exactly", () => {
    for (const v of ["=1+1", "+x", "-5", "@a", "\t=1", "  =HYPERLINK(\"x\")", "normal", "'plain apostrophe", ""]) {
      expect(restoreFormula(neutraliseFormula(v))).toBe(v);
    }
  });
  it("does not strip an ordinary leading apostrophe", () => {
    expect(restoreFormula("'tis the season")).toBe("'tis the season");
  });
});

describe("toCsv", () => {
  it("writes headers, CRLF rows and a trailing newline", () => {
    expect(toCsv(["A", "B"], [["1", "x"], ["2", "y"]], new Set())).toBe("A,B\r\n1,x\r\n2,y\r\n");
  });
  it("sanitises only the declared text columns, then quotes", () => {
    const out = toCsv(["Amount", "Note"], [["-5.00", "=cmd|' /C calc'!A0"]], new Set([1]));
    expect(out).toBe("Amount,Note\r\n-5.00,'=cmd|' /C calc'!A0\r\n"); // amount untouched, note prefixed
  });
  it("round-trips awkward text through quoting", () => {
    const out = toCsv(["T"], [['He said "yes", then\nleft']], new Set([0]));
    expect(out).toBe('T\r\n"He said ""yes"", then\nleft"\r\n');
  });
  it("keeps unicode intact", () => {
    expect(toCsv(["T"], [["₦ café 日本"]], new Set([0]))).toContain("₦ café 日本");
  });
});
