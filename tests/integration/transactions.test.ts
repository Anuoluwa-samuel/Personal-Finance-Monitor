import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { category, transactions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
let alice: string;
let bob: string;
let food: string; // expense
let transport: string; // expense
let salary: string; // income

const base = (over: Record<string, unknown> = {}) => ({
  kind: "expense" as const,
  amount: "1500.50",
  description: "Lunch",
  categoryId: food,
  transactionDate: "2025-03-14",
  ...over,
});

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, `expected ${code}`).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
  users.push(alice, bob);
  food = await systemCategoryId("expense", "Food and groceries");
  transport = await systemCategoryId("expense", "Transport");
  salary = await systemCategoryId("income", "Salary");
});

afterAll(async () => {
  await deleteTestUsers(users);
});

describe("create", () => {
  it("stores an exact amount and returns it canonically", async () => {
    const t = await createTransaction(alice, base());
    expect(t.amount).toBe("1500.50");
    expect(t.currency).toBe("NGN");
    expect(t.categoryName).toBe("Food and groceries");
    const [raw] = await db.select().from(transactions).where(eq(transactions.id, t.id));
    expect(raw.amount).toBe("1500.5000");
    expect(raw.userId).toBe(alice);
  });

  it("rejects a category of the wrong type", async () => {
    await expectAppError(createTransaction(alice, base({ categoryId: salary })), "VALIDATION");
    await expectAppError(createTransaction(alice, base({ kind: "income" })), "VALIDATION");
  });

  it("rejects another user's category and unknown categories", async () => {
    const [bobsCat] = await db
      .insert(category)
      .values({ userId: bob, type: "expense", name: "Bob only" })
      .returning();
    await expectAppError(createTransaction(alice, base({ categoryId: bobsCat.id })), "VALIDATION");
    await expectAppError(
      createTransaction(alice, base({ categoryId: "00000000-0000-4000-8000-000000000000" })),
      "VALIDATION",
    );
    // The owner can use it.
    await expect(createTransaction(bob, base({ categoryId: bobsCat.id }))).resolves.toBeTruthy();
  });

  it("rejects archived categories for new entries", async () => {
    const [cat] = await db
      .insert(category)
      .values({ userId: alice, type: "expense", name: "Old stuff", archivedAt: new Date() })
      .returning();
    await expectAppError(createTransaction(alice, base({ categoryId: cat.id })), "VALIDATION");
  });

  it("rejects zero, negative and over-precise amounts", async () => {
    for (const amount of ["0", "-5", "1.005"]) {
      await expect(createTransaction(alice, base({ amount }))).rejects.toThrow();
    }
  });
});

describe("idempotency", () => {
  it("returns the original on a retry and stores one row", async () => {
    const key = "idem-key-retry-0001";
    const a = await createTransaction(alice, base({ idempotencyKey: key, description: "Retry me" }));
    const b = await createTransaction(alice, base({ idempotencyKey: key, description: "Retry me" }));
    expect(b.id).toBe(a.id);
    const rows = await db.select().from(transactions).where(eq(transactions.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("collapses concurrent duplicate submissions", async () => {
    const key = "idem-key-concurrent-01";
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createTransaction(alice, base({ idempotencyKey: key, description: "Race" }))),
    );
    const ids = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1);
    const rows = await db.select().from(transactions).where(eq(transactions.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("rejects the same key with a different payload", async () => {
    const key = "idem-key-conflict-001";
    await createTransaction(alice, base({ idempotencyKey: key }));
    await expectAppError(createTransaction(alice, base({ idempotencyKey: key, amount: "9.00" })), "CONFLICT");
  });

  it("scopes keys per user", async () => {
    const key = "idem-key-per-user-001";
    const a = await createTransaction(alice, base({ idempotencyKey: key }));
    const b = await createTransaction(bob, base({ idempotencyKey: key }));
    expect(b.id).not.toBe(a.id);
  });
});

describe("ownership isolation", () => {
  it("reports other users' rows as not found for read, update and delete", async () => {
    const t = await createTransaction(alice, base({ description: "Alice private" }));
    await expectAppError(getTransaction(bob, t.id), "NOT_FOUND");
    await expectAppError(updateTransaction(bob, t.id, { amount: "1.00" }), "NOT_FOUND");
    await expectAppError(deleteTransaction(bob, t.id), "NOT_FOUND");
    const still = await getTransaction(alice, t.id);
    expect(still.amount).toBe("1500.50");
    expect(still.description).toBe("Alice private");
  });

  it("never lists another user's rows", async () => {
    await createTransaction(alice, base({ description: "ALICE-ONLY-MARKER" }));
    const page = await listTransactions(bob, { q: "ALICE-ONLY-MARKER" });
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
  });

  it("rejects malformed ids", async () => {
    await expect(getTransaction(alice, "not-a-uuid")).rejects.toThrow();
  });
});

describe("update and delete", () => {
  it("edits fields and bumps updatedAt", async () => {
    const t = await createTransaction(alice, base({ description: "Before" }));
    await new Promise((r) => setTimeout(r, 15));
    const u = await updateTransaction(alice, t.id, { amount: "20.25", description: "After", categoryId: transport });
    expect(u).toMatchObject({ amount: "20.25", description: "After", categoryName: "Transport" });
    expect(Date.parse(u.updatedAt)).toBeGreaterThan(Date.parse(t.updatedAt));
    expect(u.createdAt).toBe(t.createdAt);
  });

  it("refuses to change kind without a matching category, and allows both together", async () => {
    const t = await createTransaction(alice, base());
    await expectAppError(updateTransaction(alice, t.id, { kind: "income" }), "VALIDATION");
    const u = await updateTransaction(alice, t.id, { kind: "income", categoryId: salary });
    expect(u.kind).toBe("income");
  });

  it("clears notes with null", async () => {
    const t = await createTransaction(alice, base({ notes: "remember" }));
    expect(t.notes).toBe("remember");
    expect((await updateTransaction(alice, t.id, { notes: null })).notes).toBeNull();
  });

  it("deletes and then reports not found", async () => {
    const t = await createTransaction(alice, base());
    await deleteTransaction(alice, t.id);
    await expectAppError(getTransaction(alice, t.id), "NOT_FOUND");
    await expectAppError(deleteTransaction(alice, t.id), "NOT_FOUND");
  });
});

describe("list", () => {
  let carol: string;
  beforeAll(async () => {
    carol = await createTestUser();
    users.push(carol);
    const rows = [
      { kind: "expense", amount: "10.00", description: "Bus 100% fare", categoryId: transport, transactionDate: "2025-01-31" },
      { kind: "expense", amount: "250.00", description: "Groceries", categoryId: food, transactionDate: "2025-02-01" },
      { kind: "expense", amount: "99.99", description: "Snacks_and more", categoryId: food, transactionDate: "2025-02-01" },
      { kind: "income", amount: "5000.00", description: "March salary", categoryId: salary, transactionDate: "2025-02-28" },
      { kind: "income", amount: "0.01", description: "Cashback", categoryId: salary, transactionDate: "2025-03-01" },
    ] as const;
    for (const r of rows) await createTransaction(carol, r);
  });

  it("filters by kind, category and inclusive date range", async () => {
    expect((await listTransactions(carol, { kind: "income" })).total).toBe(2);
    expect((await listTransactions(carol, { categoryId: food })).total).toBe(2);
    const feb = await listTransactions(carol, { from: "2025-02-01", to: "2025-02-28" });
    expect(feb.items.map((i) => i.description).sort()).toEqual(["Groceries", "March salary", "Snacks_and more"]);
  });

  it("treats LIKE wildcards in search literally", async () => {
    expect((await listTransactions(carol, { q: "100%" })).total).toBe(1);
    expect((await listTransactions(carol, { q: "%" })).total).toBe(1);
    expect((await listTransactions(carol, { q: "_" })).total).toBe(1);
    expect((await listTransactions(carol, { q: "groc" })).total).toBe(1);
  });

  it("sorts by amount numerically, not textually", async () => {
    const page = await listTransactions(carol, { sort: "amount", dir: "asc" });
    expect(page.items.map((i) => i.amount)).toEqual(["0.01", "10.00", "99.99", "250.00", "5000.00"]);
  });

  it("paginates stably without overlap", async () => {
    const p1 = await listTransactions(carol, { pageSize: 2, page: 1 });
    const p2 = await listTransactions(carol, { pageSize: 2, page: 2 });
    const p3 = await listTransactions(carol, { pageSize: 2, page: 3 });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(5);
    expect(p1.total).toBe(5);
    expect(p3.items).toHaveLength(1);
  });
});

describe("database constraints (bypassing the service)", () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    userId: alice,
    kind: "expense" as const,
    amount: "5.0000",
    description: "raw",
    categoryId: food,
    transactionDate: "2025-01-01",
    ...over,
  });

  it("rejects non-positive and oversized amounts", async () => {
    await expect(db.insert(transactions).values(raw({ amount: "0" }))).rejects.toThrow();
    await expect(db.insert(transactions).values(raw({ amount: "-1" }))).rejects.toThrow();
    await expect(db.insert(transactions).values(raw({ amount: "1000000000000" }))).rejects.toThrow();
  });

  it("rejects a kind that disagrees with the category type", async () => {
    await expect(db.insert(transactions).values(raw({ kind: "income" }))).rejects.toThrow();
  });

  it("rejects blank descriptions and dangling users", async () => {
    await expect(db.insert(transactions).values(raw({ description: "   " }))).rejects.toThrow();
    await expect(db.insert(transactions).values(raw({ userId: "no-such-user" }))).rejects.toThrow();
  });

  it("blocks deleting a category that has history", async () => {
    await expect(db.delete(category).where(eq(category.id, food))).rejects.toThrow();
  });
});

describe("exact arithmetic in SQL", () => {
  it("sums 0.1 + 0.2 to exactly 0.3", async () => {
    const dave = await createTestUser();
    users.push(dave);
    await createTransaction(dave, base({ amount: "0.10" }));
    await createTransaction(dave, base({ amount: "0.20" }));
    const [{ total }] = await db
      .select({ total: sql<string>`sum(${transactions.amount})` })
      .from(transactions)
      .where(eq(transactions.userId, dave));
    expect(total).toBe("0.3000");
  });
});

describe("account deletion", () => {
  it("removes the user's transactions and custom categories", async () => {
    const erin = await createTestUser();
    const [cat] = await db.insert(category).values({ userId: erin, type: "expense", name: "Erin cat" }).returning();
    await createTransaction(erin, base({ categoryId: cat.id }));
    await deleteTestUsers([erin]);
    expect(await db.select().from(transactions).where(eq(transactions.userId, erin))).toHaveLength(0);
    expect(await db.select().from(category).where(eq(category.userId, erin))).toHaveLength(0);
  });
});
