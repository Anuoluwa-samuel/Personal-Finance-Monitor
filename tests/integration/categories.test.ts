import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { category } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  MAX_CUSTOM_CATEGORIES,
  createCategory,
  listCategories,
  setCategoryArchived,
  updateCategory,
} from "@/server/categories";
import { createTransaction, listTransactions, listUsableCategories } from "@/server/transactions";
import { createTestUser, deleteTestUsers, systemCategoryId } from "../support/db";

const users: string[] = [];
let alice: string;
let bob: string;
let food: string;

async function code(p: Promise<unknown>) {
  const e = await p.then(() => null, (x) => x);
  return e instanceof AppError ? e.code : e instanceof Error ? `other:${e.name}` : null;
}

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
  users.push(alice, bob);
  food = await systemCategoryId("expense", "Food and groceries");
});
afterAll(() => deleteTestUsers(users));

describe("system categories", () => {
  it("are listed for everyone, flagged, and cannot be modified or archived", async () => {
    const list = await listCategories(alice);
    const sys = list.find((c) => c.id === food)!;
    expect(sys.isSystem).toBe(true);
    expect(await code(updateCategory(alice, food, { name: "Hacked" }))).toBe("FORBIDDEN");
    expect(await code(setCategoryArchived(alice, food, true))).toBe("FORBIDDEN");
  });
});

describe("create", () => {
  it("creates a custom category usable for transactions", async () => {
    const c = await createCategory(alice, { type: "expense", name: "  Pets  ", icon: "heart", color: "#0f6b5c" });
    expect(c).toMatchObject({ name: "Pets", isSystem: false, archived: false, icon: "heart" });
    const t = await createTransaction(alice, {
      kind: "expense", amount: "10", description: "Dog food", categoryId: c.id, transactionDate: "2025-03-01",
    });
    expect(t.categoryName).toBe("Pets");
  });

  it("rejects duplicates case-insensitively, including system names", async () => {
    expect(await code(createCategory(alice, { type: "expense", name: "pets" }))).toBe("CONFLICT");
    expect(await code(createCategory(alice, { type: "expense", name: "food AND groceries" }))).toBe("CONFLICT");
  });

  it("allows the same name under a different type and for a different user", async () => {
    await expect(createCategory(alice, { type: "income", name: "Pets" })).resolves.toBeTruthy();
    await expect(createCategory(bob, { type: "expense", name: "Pets" })).resolves.toBeTruthy();
  });

  it("rejects bad icons, colours, blank names and unknown keys", async () => {
    expect(await code(createCategory(alice, { type: "expense", name: "X1", icon: "skull" as never }))).toBe("other:ZodError");
    expect(await code(createCategory(alice, { type: "expense", name: "X2", color: "#123456" }))).toBe("other:ZodError");
    expect(await code(createCategory(alice, { type: "expense", name: "   " }))).toBe("other:ZodError");
    expect(await code(createCategory(alice, { type: "expense", name: "X3", userId: "bob" } as never))).toBe("other:ZodError");
  });

  it("collapses concurrent creates of the same name to one", async () => {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => createCategory(alice, { type: "expense", name: "Race cat" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(AppError);
  });

  it("enforces the per-user limit", async () => {
    const carol = await createTestUser();
    users.push(carol);
    await db.insert(category).values(
      Array.from({ length: MAX_CUSTOM_CATEGORIES }, (_, i) => ({ userId: carol, type: "expense" as const, name: `Bulk ${i}` })),
    );
    expect(await code(createCategory(carol, { type: "expense", name: "One too many" }))).toBe("CONFLICT");
  });
});

describe("ownership", () => {
  it("treats another user's category as not found for update and archive", async () => {
    const mine = await createCategory(alice, { type: "expense", name: "Alice secret" });
    expect(await code(updateCategory(bob, mine.id, { name: "Stolen" }))).toBe("NOT_FOUND");
    expect(await code(setCategoryArchived(bob, mine.id, true))).toBe("NOT_FOUND");
    expect((await listCategories(bob)).some((c) => c.id === mine.id)).toBe(false);
  });
});

describe("update", () => {
  it("renames, restyles, and blocks renames that collide", async () => {
    const c = await createCategory(alice, { type: "expense", name: "Gym" });
    await updateCategory(alice, c.id, { name: "Fitness", color: "#1f5fa8", icon: null });
    const after = (await listCategories(alice)).find((x) => x.id === c.id)!;
    expect(after).toMatchObject({ name: "Fitness", color: "#1f5fa8", icon: null });
    expect(await code(updateCategory(alice, c.id, { name: "Transport" }))).toBe("CONFLICT");
    await expect(updateCategory(alice, c.id, { name: "FITNESS" })).resolves.toBeUndefined(); // own name, new case
  });

  it("cannot change type (not in the allowlist)", async () => {
    const c = await createCategory(alice, { type: "expense", name: "Typed" });
    expect(await code(updateCategory(alice, c.id, { type: "income" } as never))).toBe("other:ZodError");
  });
});

describe("archive and history", () => {
  it("hides archived categories from pickers, keeps history labelled, and can restore", async () => {
    const c = await createCategory(alice, { type: "expense", name: "Old hobby" });
    const t = await createTransaction(alice, {
      kind: "expense", amount: "99.99", description: "Kit", categoryId: c.id, transactionDate: "2025-01-02",
    });
    await setCategoryArchived(alice, c.id, true);

    expect((await listUsableCategories(alice)).some((x) => x.id === c.id)).toBe(false);
    expect((await listCategories(alice)).find((x) => x.id === c.id)).toMatchObject({ archived: true, usage: 1 });

    const history = await listTransactions(alice, { q: "Kit" });
    expect(history.items[0]).toMatchObject({ id: t.id, categoryName: "Old hobby", amount: "99.99" });

    await expect(
      createTransaction(alice, { kind: "expense", amount: "1", description: "New", categoryId: c.id, transactionDate: "2025-01-03" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await setCategoryArchived(alice, c.id, false);
    expect((await listUsableCategories(alice)).some((x) => x.id === c.id)).toBe(true);
  });
});
