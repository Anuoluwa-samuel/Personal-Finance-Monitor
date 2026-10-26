import { z } from "zod";
import { isInSupportedRange, isValidCalendarDate } from "@/server/domain/dates";
import { MoneyError, parseAmount } from "@/server/domain/money";
import { flowTypeSchema } from "./transaction";

const amount = z
  .string({ error: "Enter an amount" })
  .max(32, "Amount is too long")
  .superRefine((v, ctx) => {
    try {
      parseAmount(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Invalid amount" });
    }
  });
const date = z
  .string({ error: "Choose a date" })
  .refine(isValidCalendarDate, "Use a real date in YYYY-MM-DD form")
  .refine((v) => !isValidCalendarDate(v) || isInSupportedRange(v), "Date is outside the supported range (2000–2100)");
const description = z.string().trim().min(1, "Add a description").max(200, "Keep it under 200 characters");
const accountId = z.string().uuid("Choose an account");

export const createRuleSchema = z
  .object({
    kind: flowTypeSchema,
    amount,
    description,
    categoryId: z.string().uuid("Choose a category"),
    accountId: accountId.nullish().transform((v) => v || null),
    frequency: z.enum(["weekly", "monthly", "yearly"], { error: "Choose how often" }),
    intervalCount: z.number({ error: "Enter a number from 1 to 52" }).int("Enter a whole number").min(1, "At least 1").max(52, "At most 52"),
    startDate: date,
    endDate: date.nullish().transform((v) => v || null),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "End date must not be before the start date", path: ["endDate"] });

/** Kind, frequency, interval and start date are fixed: to change the schedule, delete the rule and create another. */
export const updateRuleSchema = z
  .object({ amount, description, categoryId: z.string().uuid("Choose a category"), accountId: accountId.nullable(), endDate: date.nullable() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const postOccurrenceSchema = z
  .object({ amount: amount.nullish().transform((v) => v || null), transactionDate: date.nullish().transform((v) => v || null) })
  .strict();

export type CreateRuleInput = z.input<typeof createRuleSchema>;
export type UpdateRuleInput = z.input<typeof updateRuleSchema>;
export type PostOccurrenceInput = z.input<typeof postOccurrenceSchema>;
