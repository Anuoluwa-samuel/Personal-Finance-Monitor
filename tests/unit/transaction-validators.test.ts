import { describe, expect, it } from "vitest";
import {
  createTransactionSchema,
  listTransactionsSchema,
  updateTransactionSchema,
} from "@/validators/transaction";

const valid = {
  kind: "expense",
  amount: "1500.50",
  description: "  Lunch  ",
  categoryId: "3f0c6f0e-6a2b-4c1e-9d8a-1a2b3c4d5e6f",
  transactionDate: "2025-03-14",
};

describe("createTransactionSchema", () => {
  it("accepts a valid payload and trims text", () => {
    const out = createTransactionSchema.parse(valid);
    expect(out.description).toBe("Lunch");
    expect(out.notes).toBeNull();
  });

  it("rejects client-supplied userId/id (writable-field allowlist)", () => {
    expect(createTransactionSchema.safeParse({ ...valid, userId: "someone-else" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...valid, id: valid.categoryId }).success).toBe(false);
  });

  it("rejects numeric amounts, so floats never enter", () => {
    expect(createTransactionSchema.safeParse({ ...valid, amount: 1500.5 }).success).toBe(false);
  });

  it.each(["0", "-1", "1.001", "abc"])("rejects amount %j", (amount) => {
    expect(createTransactionSchema.safeParse({ ...valid, amount }).success).toBe(false);
  });

  it("rejects impossible dates and blank descriptions", () => {
    expect(createTransactionSchema.safeParse({ ...valid, transactionDate: "2025-02-30" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...valid, description: "   " }).success).toBe(false);
  });

  it("enforces length limits", () => {
    expect(createTransactionSchema.safeParse({ ...valid, description: "x".repeat(201) }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("updateTransactionSchema", () => {
  it("requires at least one field and rejects unknown ones", () => {
    expect(updateTransactionSchema.safeParse({}).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ userId: "x" }).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ amount: "10" }).success).toBe(true);
  });
});

describe("listTransactionsSchema", () => {
  it("applies defaults and coerces paging", () => {
    const out = listTransactionsSchema.parse({ page: "2", pageSize: "50" });
    expect(out).toMatchObject({ page: 2, pageSize: 50, sort: "date", dir: "desc" });
  });
  it("caps page size and rejects inverted ranges", () => {
    expect(listTransactionsSchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(listTransactionsSchema.safeParse({ from: "2025-05-02", to: "2025-05-01" }).success).toBe(false);
  });
});
