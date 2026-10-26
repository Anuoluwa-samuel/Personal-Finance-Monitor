import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { importBatch, transactions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { exportTransactionsCsv } from "@/server/export";
import { confirmImport, discardImport, previewImport } from "@/server/import";
import { createTransaction } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  users.push(u);
  return u;
};
const H = "Date,Type,Amount,Description,Category,Notes\r\n";
const count = async (u: string) => (await db.select().from(transactions).where(eq(transactions.userId, u))).length;
const ok = <T extends { ok: boolean }>(p: T) => {
  expect(p.ok).toBe(true);
  return p as Extract<T, { ok: true }>;
};

let food: string;
let salary: string;
beforeAll(async () => {
  food = await systemCategoryId("expense", "Food and groceries");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(() => deleteTestUsers(users));

describe("preview", () => {
  it("validates and stages without writing any transactions", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,100.50,Lunch,Food and groceries,\r\n2025-03-02,income,5000,Pay,Salary,n\r\n"));
    expect(p).toMatchObject({ newCount: 2, duplicateCount: 0, income: "5000.00", expense: "100.50", from: "2025-03-01", to: "2025-03-02" });
    expect(p.batchId).toBeTruthy();
    expect(await count(u)).toBe(0);
  });

  it("stages nothing and reports every error when any row is invalid", async () => {
    const u = await fresh();
    const p = await previewImport(u, "bad.csv", H + "2025-02-30,expense,1,x,Food and groceries,\r\n2025-03-01,expense,abc,y,Nope,\r\n2025-03-01,expense,5,ok,Food and groceries,\r\n");
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.totalErrors).toBe(2);
      expect(p.errors.map((e) => e.line)).toEqual([2, 3]);
    }
    expect(await db.select().from(importBatch).where(eq(importBatch.userId, u))).toHaveLength(0);
  });

  it("rejects unusable files with a clear message", async () => {
    const u = await fresh();
    for (const text of ["", "Date,Amount\r\n1,2\r\n", H, 'Date,Type\r\n"unclosed']) {
      const p = await previewImport(u, "x.csv", text);
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.message.length).toBeGreaterThan(5);
    }
  });

  it("enforces the row limit", async () => {
    const u = await fresh();
    const rows = Array.from({ length: 2001 }, () => "2025-03-01,expense,1,x,Food and groceries,").join("\r\n");
    const p = await previewImport(u, "big.csv", H + rows);
    expect(p.ok).toBe(false);
  });

  it("treats formulas as inert text", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "f.csv", H + '2025-03-01,expense,5,"=HYPERLINK(""http://x"")",Food and groceries,\r\n'));
    await confirmImport(u, p.batchId!);
    const [row] = await db.select().from(transactions).where(eq(transactions.userId, u));
    expect(row.description).toBe('=HYPERLINK("http://x")');
  });
});

describe("confirm", () => {
  it("writes exactly the staged rows, once, and is idempotent", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n2025-03-02,expense,20,B,Food and groceries,\r\n"));
    expect(await confirmImport(u, p.batchId!)).toEqual({ inserted: 2, alreadyCommitted: false });
    expect(await count(u)).toBe(2);
    expect(await confirmImport(u, p.batchId!)).toEqual({ inserted: 2, alreadyCommitted: true });
    expect(await count(u)).toBe(2);
  });

  it("is all-or-nothing: a failure part-way leaves no rows behind", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n2025-03-02,expense,20,B,Food and groceries,\r\n"));
    // Sabotage the second staged row so the database rejects it mid-transaction.
    const [b] = await db.select().from(importBatch).where(eq(importBatch.id, p.batchId!));
    await db.update(importBatch).set({ rows: [b.rows[0], { ...b.rows[1], categoryId: "00000000-0000-4000-8000-000000000000" }] }).where(eq(importBatch.id, b.id));
    await expect(confirmImport(u, p.batchId!)).rejects.toThrow();
    expect(await count(u)).toBe(0);
    expect((await db.select().from(importBatch).where(eq(importBatch.id, b.id)))[0].committedAt).toBeNull();
  });

  it("cannot be confirmed by another user", async () => {
    const a = await fresh();
    const b = await fresh();
    const p = ok(await previewImport(a, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n"));
    await expect(confirmImport(b, p.batchId!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await count(a)).toBe(0);
    expect(await count(b)).toBe(0);
  });

  it("refuses an expired preview", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n"));
    await db.update(importBatch).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(importBatch.id, p.batchId!));
    const e = await confirmImport(u, p.batchId!).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("CONFLICT");
  });

  it("collapses concurrent confirms to one import", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n"));
    await Promise.allSettled([confirmImport(u, p.batchId!), confirmImport(u, p.batchId!), confirmImport(u, p.batchId!)]);
    expect(await count(u)).toBe(1);
  });

  it("discard removes an unconfirmed preview", async () => {
    const u = await fresh();
    const p = ok(await previewImport(u, "a.csv", H + "2025-03-01,expense,10,A,Food and groceries,\r\n"));
    await discardImport(u, p.batchId!);
    await expect(confirmImport(u, p.batchId!)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("de-duplication", () => {
  const file = H + "2025-03-01,expense,10,Coffee,Food and groceries,\r\n2025-03-01,expense,10,Coffee,Food and groceries,\r\n2025-03-02,income,50,Pay,Salary,\r\n";

  it("keeps genuinely identical rows within one file, then skips them all on re-import", async () => {
    const u = await fresh();
    const first = ok(await previewImport(u, "a.csv", file));
    expect(first.newCount).toBe(3);
    await confirmImport(u, first.batchId!);
    expect(await count(u)).toBe(3);

    const again = ok(await previewImport(u, "a.csv", file));
    expect(again).toMatchObject({ newCount: 0, duplicateCount: 3, batchId: null });
    expect(await count(u)).toBe(3);
  });

  it("imports only the new rows of a longer file", async () => {
    const u = await fresh();
    await confirmImport(u, ok(await previewImport(u, "a.csv", file)).batchId!);
    const longer = ok(await previewImport(u, "b.csv", file + "2025-03-03,expense,7,Bus,Food and groceries,\r\n"));
    expect(longer).toMatchObject({ newCount: 1, duplicateCount: 3 });
  });

  it("does not treat another user's import as a duplicate", async () => {
    const a = await fresh();
    const b = await fresh();
    await confirmImport(a, ok(await previewImport(a, "a.csv", file)).batchId!);
    expect(ok(await previewImport(b, "a.csv", file)).newCount).toBe(3);
  });
});

describe("round trip with export", () => {
  it("re-importing an export into another account reproduces the data, including formula-like text", async () => {
    const a = await fresh();
    const b = await fresh();
    await createTransaction(a, { kind: "expense", amount: "1500.5", description: '=SUM(A1) "quoted", comma', categoryId: food, transactionDate: "2025-03-09", notes: "line1\nline2" });
    await createTransaction(a, { kind: "income", amount: "0.10", description: "Pay", categoryId: salary, transactionDate: "2025-03-02" });
    const { csv } = await exportTransactionsCsv(a);
    await confirmImport(b, ok(await previewImport(b, "export.csv", "﻿" + csv)).batchId!);
    const back = (await exportTransactionsCsv(b)).csv;
    expect(back).toBe(csv);
  });
});

describe("accounts in import and export", () => {
  const HA = "Date,Type,Amount,Description,Category,Account,Notes\r\n";

  it("assigns rows to an existing active account and rejects unknown or archived ones", async () => {
    const { createAccount, setAccountArchived } = await import("@/server/accounts");
    const u = await fresh();
    const bank = await createAccount(u, { name: "GTBank" });
    const old = await createAccount(u, { name: "Closed" });
    await setAccountArchived(u, old, true);

    const good = ok(await previewImport(u, "a.csv", HA + "2025-03-01,expense,10,A,Food and groceries,gtbank,\r\n2025-03-02,expense,5,B,Food and groceries,,\r\n"));
    await confirmImport(u, good.batchId!);
    const rows = await db.select().from(transactions).where(eq(transactions.userId, u));
    expect(rows.find((r) => r.description === "A")?.accountId).toBe(bank);
    expect(rows.find((r) => r.description === "B")?.accountId).toBeNull();

    for (const name of ["Nope", "Closed"]) {
      const bad = await previewImport(u, "b.csv", HA + `2025-03-03,expense,1,C,Food and groceries,${name},\r\n`);
      expect(bad.ok).toBe(false);
    }
  });

  it("round-trips account names through export and import", async () => {
    const { createAccount } = await import("@/server/accounts");
    const a = await fresh();
    const b = await fresh();
    const acc = await createAccount(a, { name: "Wallet" });
    await createAccount(b, { name: "Wallet" });
    await createTransaction(a, { kind: "expense", amount: "12", description: "Snack", categoryId: food, accountId: acc, transactionDate: "2025-03-04" });
    const { csv } = await exportTransactionsCsv(a);
    expect(csv).toContain("Snack,Food and groceries,Wallet,");
    await confirmImport(b, ok(await previewImport(b, "e.csv", csv)).batchId!);
    expect((await exportTransactionsCsv(b)).csv).toBe(csv);
  });

  it("treats the same row on different accounts as different transactions", async () => {
    const { createAccount } = await import("@/server/accounts");
    const u = await fresh();
    await createAccount(u, { name: "One" });
    await createAccount(u, { name: "Two" });
    const p = ok(await previewImport(u, "a.csv", HA + "2025-03-01,expense,10,Same,Food and groceries,One,\r\n2025-03-01,expense,10,Same,Food and groceries,Two,\r\n"));
    expect(p.newCount).toBe(2);
    await confirmImport(u, p.batchId!);
    expect(ok(await previewImport(u, "a.csv", HA + "2025-03-01,expense,10,Same,Food and groceries,One,\r\n")).duplicateCount).toBe(1);
  });
});
