import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { moneyAccount, transactions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { MAX_ACCOUNTS, createAccount, listAccounts, listUsableAccounts, setAccountArchived, updateAccount } from "@/server/accounts";
import { getDashboard } from "@/server/analytics";
import { createTransaction, listTransactions, updateTransaction } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  users.push(u);
  return u;
};
async function code(p: Promise<unknown>) {
  const e = await p.then(() => null, (x) => x);
  return e instanceof AppError ? e.code : e instanceof Error ? `other:${e.name}` : null;
}
let food: string;
let salary: string;
const NOW = new Date("2025-03-15T12:00:00Z");
const tx = (u: string, over: Record<string, unknown> = {}) =>
  createTransaction(u, { kind: "expense", amount: "10", description: "x", categoryId: food, transactionDate: "2025-03-01", ...over } as never);

beforeAll(async () => {
  food = await systemCategoryId("expense", "Food and groceries");
  salary = await systemCategoryId("income", "Salary");
});
afterAll(() => deleteTestUsers(users));

describe("accounts", () => {
  it("computes balance = opening + income - expenses, exactly, per account", async () => {
    const u = await fresh();
    const bank = await createAccount(u, { name: "GTBank", openingBalance: "1000.10" });
    const cash = await createAccount(u, { name: "Cash" });
    await tx(u, { accountId: bank, amount: "0.20" });
    await tx(u, { accountId: bank, kind: "income", categoryId: salary, amount: "500" });
    await tx(u, { accountId: cash, amount: "5" });
    await tx(u, { amount: "999" }); // no account: in no account's balance
    const list = await listAccounts(u);
    expect(list.find((a) => a.name === "GTBank")).toMatchObject({ openingBalance: "1000.10", balance: "1499.90", transactionCount: 2 });
    expect(list.find((a) => a.name === "Cash")).toMatchObject({ balance: "-5.00", transactionCount: 1 });
  });

  it("includes opening balances (archived too) in the dashboard recorded balance, and never in income/expense", async () => {
    const u = await fresh();
    const a = await createAccount(u, { name: "Old", openingBalance: "100" });
    await createAccount(u, { name: "New", openingBalance: "50.50" });
    await tx(u, { accountId: a, amount: "30" });
    await tx(u, { kind: "income", categoryId: salary, amount: "200" });
    await setAccountArchived(u, a, true);
    const d = await getDashboard(u, {}, NOW);
    expect(d.recordedBalance).toBe("320.50"); // 100 + 50.50 + 200 - 30
    expect(d.totals).toMatchObject({ income: "200.00", expense: "30.00" });
  });

  it("rejects duplicate names (case-insensitive), bad input and the account limit", async () => {
    const u = await fresh();
    await createAccount(u, { name: "Wallet" });
    expect(await code(createAccount(u, { name: "wallet" }))).toBe("CONFLICT");
    expect(await code(createAccount(u, { name: "  " }))).toBe("other:ZodError");
    expect(await code(createAccount(u, { name: "N", openingBalance: "-1" }))).toBe("other:ZodError");
    expect(await code(createAccount(u, { name: "N", openingBalance: "1.234" }))).toBe("other:ZodError");
    const other = await fresh();
    await expect(createAccount(other, { name: "Wallet" })).resolves.toBeTruthy(); // per user
    const full = await fresh();
    await db.insert(moneyAccount).values(Array.from({ length: MAX_ACCOUNTS }, (_, i) => ({ userId: full, name: `A${i}` })));
    expect(await code(createAccount(full, { name: "One more" }))).toBe("CONFLICT");
  });

  it("collapses concurrent creates of one name to a single account", async () => {
    const u = await fresh();
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => createAccount(u, { name: "Race" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("renames and changes the opening balance; archived accounts leave pickers but keep history", async () => {
    const u = await fresh();
    const a = await createAccount(u, { name: "Savings" });
    const t = await tx(u, { accountId: a });
    await updateAccount(u, a, { name: "Piggy", openingBalance: "20" });
    expect((await listAccounts(u))[0]).toMatchObject({ name: "Piggy", openingBalance: "20.00", balance: "10.00" });
    await setAccountArchived(u, a, true);
    expect((await listUsableAccounts(u)).map((x) => x.id)).not.toContain(a);
    expect((await listTransactions(u, { accountId: a })).items[0]).toMatchObject({ id: t.id, accountName: "Piggy" });
    await setAccountArchived(u, a, false);
    expect((await listUsableAccounts(u)).map((x) => x.id)).toContain(a);
  });
});

describe("transactions and accounts", () => {
  it("rejects another user's, archived and unknown accounts on create and update", async () => {
    const a = await fresh();
    const b = await fresh();
    const theirs = await createAccount(b, { name: "Bob's" });
    const gone = await createAccount(a, { name: "Closed" });
    await setAccountArchived(a, gone, true);
    for (const accountId of [theirs, gone, "00000000-0000-4000-8000-000000000000"]) {
      expect(await code(tx(a, { accountId }))).toBe("VALIDATION");
    }
    const t = await tx(a);
    expect(await code(updateTransaction(a, t.id, { accountId: theirs }))).toBe("VALIDATION");
    const mine = await createAccount(a, { name: "Mine" });
    expect((await updateTransaction(a, t.id, { accountId: mine })).accountName).toBe("Mine");
    expect((await updateTransaction(a, t.id, { accountId: null })).accountId).toBeNull();
  });

  it("is enforced by the database too (composite foreign key)", async () => {
    const a = await fresh();
    const b = await fresh();
    const theirs = await createAccount(b, { name: "Bob's" });
    await expect(
      db.insert(transactions).values({ userId: a, kind: "expense", amount: "1", description: "x", categoryId: food, transactionDate: "2025-03-01", accountId: theirs }),
    ).rejects.toThrow();
  });

  it("keeps editing a transaction possible after its account is archived, and filters by account", async () => {
    const u = await fresh();
    const acc = await createAccount(u, { name: "Temp" });
    const t = await tx(u, { accountId: acc });
    await tx(u);
    await setAccountArchived(u, acc, true);
    expect((await updateTransaction(u, t.id, { description: "renamed" })).accountName).toBe("Temp");
    expect((await listTransactions(u, { accountId: acc })).total).toBe(1);
  });

  it("hides other users' accounts and balances", async () => {
    const a = await fresh();
    const b = await fresh();
    const id = await createAccount(a, { name: "Private", openingBalance: "777" });
    expect(await listAccounts(b)).toEqual([]);
    expect(await code(updateAccount(b, id, { name: "x" }))).toBe("NOT_FOUND");
    expect(await code(setAccountArchived(b, id, true))).toBe("NOT_FOUND");
  });

  it("deleting a user removes accounts and their transactions without constraint errors", async () => {
    const u = await createTestUser();
    const acc = await createAccount(u, { name: "Gone" });
    await tx(u, { accountId: acc });
    await expect(deleteTestUsers([u])).resolves.toBeUndefined();
  });
});
