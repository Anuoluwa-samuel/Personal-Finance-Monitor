import { isInSupportedRange, isValidCalendarDate } from "./dates";
import { restoreFormula } from "./csv";
import { DEFAULT_CURRENCY, MoneyError, minorToDecimal, parseAmount } from "./money";

export const IMPORT_MAX_ROWS = 2000;

export type ImportRow = {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  kind: "income" | "expense";
  /** Canonical decimal string. */
  amount: string;
  description: string;
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  transactionDate: string;
  notes: string | null;
};

export type RowError = { line: number; message: string };

export type CategoryLookup = { id: string; name: string; type: "income" | "expense" }[];
export type AccountLookup = { id: string; name: string }[];

const REQUIRED = ["date", "type", "amount", "description", "category"] as const;

/** Maps header names (case-insensitive) to column indexes. Returns an error message when the header is unusable. */
export function readHeader(header: string[]): { index: Record<string, number> } | { error: string } {
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !(key in index)) index[key] = i;
  });
  const missing = REQUIRED.filter((k) => !(k in index));
  if (missing.length) return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected columns: Date, Type, Amount, Description, Category (Account, Notes and Currency optional).` };
  return { index };
}

/** Validates every data row. Collects ALL errors instead of stopping at the first. Nothing here touches the database. */
export function validateRows(
  table: string[][],
  index: Record<string, number>,
  categories: CategoryLookup,
  accounts: AccountLookup = [],
): { rows: ImportRow[]; errors: RowError[] } {
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const cell = (r: string[], key: string) => (key in index ? (r[index[key]] ?? "") : "");

  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const problems: string[] = [];

    if (r.length > Object.keys(index).length + 50) problems.push("Too many columns");

    const date = cell(r, "date").trim();
    if (!isValidCalendarDate(date)) problems.push(`Date “${date}” is not a real date in YYYY-MM-DD form`);
    else if (!isInSupportedRange(date)) problems.push("Date must be between 2000 and 2100");

    const kindRaw = cell(r, "type").trim().toLowerCase();
    const kind = kindRaw === "income" || kindRaw === "expense" ? kindRaw : null;
    if (!kind) problems.push(`Type “${cell(r, "type")}” must be income or expense`);

    let amount = "";
    try {
      amount = minorToDecimal(parseAmount(cell(r, "amount")));
    } catch (e) {
      problems.push(`Amount “${cell(r, "amount")}”: ${e instanceof MoneyError ? e.message : "invalid"}`);
    }

    const currency = cell(r, "currency").trim().toUpperCase();
    if (currency && currency !== DEFAULT_CURRENCY) problems.push(`Currency ${currency} is not supported (only ${DEFAULT_CURRENCY})`);

    const description = restoreFormula(cell(r, "description")).trim();
    if (!description) problems.push("Description is empty");
    else if (description.length > 200) problems.push("Description is longer than 200 characters");

    const notesRaw = restoreFormula(cell(r, "notes")).trim();
    if (notesRaw.length > 1000) problems.push("Notes are longer than 1000 characters");

    const categoryName = restoreFormula(cell(r, "category")).trim();
    let categoryId = "";
    if (!categoryName) problems.push("Category is empty");
    else if (kind) {
      const match = categories.find((c) => c.type === kind && c.name.toLowerCase() === categoryName.toLowerCase());
      if (!match) problems.push(`No ${kind} category named “${categoryName}”. Create it first or fix the name.`);
      else categoryId = match.id;
    }

    const accountName = restoreFormula(cell(r, "account")).trim();
    let accountId: string | null = null;
    if (accountName) {
      const acc = accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase());
      if (!acc) problems.push(`No active account named “${accountName}”. Create it first or leave the column empty.`);
      else accountId = acc.id;
    }

    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
    } else {
      const matched = categories.find((c) => c.id === categoryId)!;
      rows.push({ line, kind: kind!, amount, description, categoryId, categoryName: matched.name, accountId, transactionDate: date, notes: notesRaw || null });
    }
  });
  return { rows, errors };
}
