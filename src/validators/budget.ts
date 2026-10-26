import { z } from "zod";
import { monthToFirstDay } from "@/server/domain/budget-rules";
import { MoneyError, parseAmount } from "@/server/domain/money";

const limit = z
  .string({ error: "Enter a limit" })
  .max(32, "Amount is too long")
  .superRefine((v, ctx) => {
    try {
      parseAmount(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Invalid amount" });
    }
  });

const line = z.object({ categoryId: z.string().uuid("Choose a category"), limit }).strict();

const lines = z
  .array(line)
  .max(30, "Use at most 30 category limits")
  .refine((ls) => new Set(ls.map((l) => l.categoryId)).size === ls.length, "Each category can only appear once");

export const createBudgetSchema = z
  .object({
    month: z.string().refine((v) => monthToFirstDay(v) !== null, "Choose a month between 2000 and 2100"),
    overallLimit: limit.nullish().transform((v) => v || null),
    lines: lines.default([]),
  })
  .strict()
  .refine((v) => v.overallLimit !== null || v.lines.length > 0, {
    message: "Set an overall limit or at least one category limit",
    path: ["overallLimit"],
  });

/** The month cannot change; archive the budget and create another instead. */
export const updateBudgetSchema = z
  .object({
    overallLimit: limit.nullish().transform((v) => v || null),
    lines: lines.default([]),
  })
  .strict()
  .refine((v) => v.overallLimit !== null || v.lines.length > 0, {
    message: "Set an overall limit or at least one category limit",
    path: ["overallLimit"],
  });

export type CreateBudgetInput = z.input<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.input<typeof updateBudgetSchema>;
