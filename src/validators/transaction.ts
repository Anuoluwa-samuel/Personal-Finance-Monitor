import { z } from "zod";
import { isInSupportedRange, isValidCalendarDate } from "@/server/domain/dates";
import { MoneyError, parseAmount } from "@/server/domain/money";

export const flowTypeSchema = z.enum(["income", "expense"]);

const amountField = z
  .string({ error: "Enter an amount" })
  .max(32, "Amount is too long")
  .superRefine((value, ctx) => {
    try {
      parseAmount(value);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Invalid amount" });
    }
  });

const dateField = z
  .string({ error: "Choose a date" })
  .refine(isValidCalendarDate, "Use a real date in YYYY-MM-DD form")
  .refine((v) => !isValidCalendarDate(v) || isInSupportedRange(v), "Date is outside the supported range (2000–2100)");

const description = z.string().trim().min(1, "Add a description").max(200, "Keep it under 200 characters");
const notes = z.string().trim().max(1000, "Keep notes under 1000 characters");

/** Writable-field allowlist for creation. Unknown keys (userId, id, timestamps...) are rejected. */
export const createTransactionSchema = z
  .object({
    kind: flowTypeSchema,
    amount: amountField,
    description,
    categoryId: z.string().uuid("Choose a category"),
    accountId: z.string().uuid("Choose an account").nullish().transform((v) => v || null),
    transactionDate: dateField,
    notes: notes.nullish().transform((v) => v || null),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid idempotency key").optional(),
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    kind: flowTypeSchema,
    amount: amountField,
    description,
    categoryId: z.string().uuid("Choose a category"),
    accountId: z.string().uuid("Choose an account").nullable(),
    transactionDate: dateField,
    notes: notes.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const listTransactionsSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    kind: flowTypeSchema.optional(),
    categoryId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    from: dateField.optional(),
    to: dateField.optional(),
    sort: z.enum(["date", "amount"]).default("date"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Start date must not be after end date",
    path: ["from"],
  });

export const idSchema = z.string().uuid("Invalid id");

export type CreateTransactionInput = z.input<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;
export type ListTransactionsInput = z.input<typeof listTransactionsSchema>;
