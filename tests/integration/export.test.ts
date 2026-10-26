import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { EXPORT_HEADERS, exportTransactionsCsv } from "@/server/export";
import { createTransaction } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
let alice: string;
let bob: string;
let food: string;
let salary: string;

const add = (u: string, over: Record<string, unknown> = {}) =>
  createTransaction(u, { kind: "expense", amount: "10", description: "x", categoryId: food, transactionDate: "2025-03-01", ...over } as never);

const lines = (csv: string) => csv.trimEnd().split("\r\n");

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
  users.push(alice, bob);
  food = await systemCategoryId("expense", "Food and groceries");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(() => deleteTestUsers(users));

describe("export", () => {
  it("writes clear headers and exact, consistently formatted rows, oldest first", async () => {
    await add(alice, { amount: "1500.5", description: "Late", transactionDate: "2025-03-09" });
    await add(alice, { kind: "income", categoryId: salary, amount: "0.10", description: "Early", transactionDate: "2025-03-02", notes: "n1" });
    const { csv, count, filename } = await exportTransactionsCsv(alice);
    expect(count).toBe(2);
    expect(filename).toBe("ispentit-transactions-all.csv");
    expect(lines(csv)).toEqual([
      EXPORT_HEADERS.join(","),
      "2025-03-02,income,0.10,NGN,Early,Salary,,n1",
      "2025-03-09,expense,1500.50,NGN,Late,Food and groceries,,",
    ]);
  });

  it("never includes another user's records", async () => {
    await add(bob, { description: "BOB-SECRET-MARKER", amount: "999" });
    const mine = await exportTransactionsCsv(alice);
    expect(mine.csv).not.toContain("BOB-SECRET-MARKER");
    expect(mine.csv).not.toContain("999.00");
    const theirs = await exportTransactionsCsv(bob);
    expect(theirs.csv).toContain("BOB-SECRET-MARKER");
    expect(theirs.csv).not.toContain("Late");
  });

  it("applies filters and names the file after the range", async () => {
    const r = await exportTransactionsCsv(alice, { from: "2025-03-05", to: "2025-03-31", kind: "expense" });
    expect(r.count).toBe(1);
    expect(r.filename).toBe("ispentit-transactions-2025-03-05_to_2025-03-31.csv");
    expect((await exportTransactionsCsv(alice, { q: "early" })).count).toBe(1);
    expect((await exportTransactionsCsv(alice, { q: "%" })).count).toBe(0); // wildcard is literal
    expect((await exportTransactionsCsv(alice, { categoryId: salary })).count).toBe(1);
  });

  it("rejects malformed filters, other users' keys and inverted ranges", async () => {
    await expect(exportTransactionsCsv(alice, { from: "2025-02-30" })).rejects.toThrow();
    await expect(exportTransactionsCsv(alice, { from: "2025-03-10", to: "2025-03-01" })).rejects.toThrow();
    await expect(exportTransactionsCsv(alice, { userId: bob } as never)).rejects.toThrow();
    await expect(exportTransactionsCsv(alice, { categoryId: "nope" })).rejects.toThrow();
  });

  it("neutralises formulas in descriptions and notes, and quotes awkward text", async () => {
    const u = await createTestUser();
    users.push(u);
    await add(u, { description: "=HYPERLINK(\"http://evil\",\"x\")", notes: "+1,\"quoted\"\nsecond line" });
    const { csv } = await exportTransactionsCsv(u);
    const body = csv.split("\r\n").slice(1).join("\r\n");
    expect(body).toContain("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(body).toContain("\"'+1,\"\"quoted\"\"\nsecond line\"");
    expect(body.startsWith("2025-03-01,expense,10.00,NGN,")).toBe(true); // amount is never prefixed
  });

  it("refuses to truncate: errors when over the row limit", async () => {
    const u = await createTestUser();
    users.push(u);
    for (let i = 0; i < 3; i++) await add(u, { description: `row ${i}` });
    const err = await exportTransactionsCsv(u, {}, 2).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toMatch(/Too many/);
    await expect(exportTransactionsCsv(u, {}, 3)).resolves.toMatchObject({ count: 3 });
  });

  it("exports an empty set as just the header row", async () => {
    const u = await createTestUser();
    users.push(u);
    const r = await exportTransactionsCsv(u);
    expect(lines(r.csv)).toEqual([EXPORT_HEADERS.join(",")]);
  });
});
