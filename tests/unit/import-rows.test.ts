import { describe, expect, it } from "vitest";
import { neutraliseFormula } from "@/server/domain/csv";
import { readHeader, validateRows } from "@/server/domain/import-rows";

const cats = [
  { id: "c-food", name: "Food and groceries", type: "expense" as const },
  { id: "c-sal", name: "Salary", type: "income" as const },
];
const H = ["Date", "Type", "Amount", "Description", "Category", "Notes"];

function run(rows: string[][], header = H) {
  const h = readHeader(header);
  if ("error" in h) throw new Error(h.error);
  return validateRows([header, ...rows], h.index, cats);
}

describe("readHeader", () => {
  it("is case-insensitive and ignores extra columns", () => {
    expect("index" in readHeader(["DATE", " type", "Amount", "description", "CATEGORY", "id", "whatever"])).toBe(true);
  });
  it("names every missing required column", () => {
    const r = readHeader(["Date", "Amount"]);
    expect("error" in r && r.error).toMatch(/type, description, category/);
  });
});

describe("validateRows", () => {
  it("accepts a good row and canonicalises it", () => {
    const { rows, errors } = run([["2025-03-14", "Expense", "1,500.5", "  Lunch ", "food and GROCERIES", ""]]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ kind: "expense", amount: "1500.50", description: "Lunch", categoryId: "c-food", categoryName: "Food and groceries", notes: null, line: 2 });
  });

  it("reports every problem on every bad row, with line numbers", () => {
    const { rows, errors } = run([
      ["2025-02-30", "expense", "10", "x", "Food and groceries", ""],
      ["2025-03-01", "transfer", "10", "x", "Food and groceries", ""],
      ["2025-03-01", "expense", "0", "x", "Food and groceries", ""],
      ["2025-03-01", "expense", "1.234", "x", "Food and groceries", ""],
      ["2025-03-01", "expense", "10", "   ", "Food and groceries", ""],
      ["2025-03-01", "expense", "10", "x", "Nonexistent", ""],
      ["2025-03-01", "expense", "10", "x", "Salary", ""], // income category on an expense row
      ["03/01/2025", "income", "abc", "", "", ""],
      ["2025-03-01", "expense", "10", "ok", "Food and groceries", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(errors[7].message.split("; ").length).toBeGreaterThanOrEqual(3); // several problems on one row
  });

  it("rejects unsupported currencies, long text and out-of-range dates", () => {
    const h = [...H, "Currency"];
    const bad = run([
      ["2025-03-01", "expense", "10", "x", "Food and groceries", "", "USD"],
      ["1999-12-31", "expense", "10", "x", "Food and groceries", "", ""],
      ["2025-03-01", "expense", "10", "x".repeat(201), "Food and groceries", "", ""],
      ["2025-03-01", "expense", "10", "x", "Food and groceries", "n".repeat(1001), ""],
    ], h);
    expect(bad.rows).toHaveLength(0);
    expect(bad.errors).toHaveLength(4);
    expect(run([["2025-03-01", "expense", "10", "x", "Food and groceries", "", "ngn"]], h).rows).toHaveLength(1);
  });

  it("stores formula-looking text as plain text, restoring the export prefix", () => {
    const { rows } = run([["2025-03-01", "expense", "10", neutraliseFormula("=HYPERLINK(\"x\")"), "Food and groceries", neutraliseFormula("+note")]]);
    expect(rows[0].description).toBe('=HYPERLINK("x")');
    expect(rows[0].notes).toBe("+note");
  });

  it("tolerates short rows (missing trailing optional cells)", () => {
    expect(run([["2025-03-01", "expense", "10", "x", "Food and groceries"]]).rows).toHaveLength(1);
  });
});
