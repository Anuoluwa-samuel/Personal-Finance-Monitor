/**
 * Strict RFC 4180 CSV parser. Pure text in, rows out; it never evaluates anything, so formulas and macros in a
 * file are just strings. Accepts CRLF, LF or CR line ends, a leading BOM, quoted fields with embedded commas and
 * newlines, and "" as an escaped quote. Blank lines are skipped.
 */
export class CsvParseError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
    this.name = "CsvParseError";
  }
}

export function parseCsv(input: string): string[][] {
  if (input.includes("\u0000")) throw new CsvParseError("The file contains binary data, not text", 1);
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;
  let line = 1;

  const endField = () => {
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    const quotedEmpty = wasQuoted; // a lone "" is a real (empty) value, not a blank line
    endField();
    if (!(row.length === 1 && row[0] === "" && !quotedEmpty)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (field !== "" || wasQuoted) throw new CsvParseError("A quote appears in the middle of a value", line);
      inQuotes = true;
      wasQuoted = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      if (wasQuoted) throw new CsvParseError("Unexpected text after a closing quote", line);
      field += c;
    }
  }
  if (inQuotes) throw new CsvParseError("A quoted value was never closed", line);
  if (field !== "" || wasQuoted || row.length > 0) endRow();
  return rows;
}
