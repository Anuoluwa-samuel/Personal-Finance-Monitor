import { z } from "zod";
import { isInSupportedRange, isValidCalendarDate } from "@/server/domain/dates";
import { MoneyError, parseAmount, parseAmountOrZero } from "@/server/domain/money";

const money = (allowZero: boolean) =>
  z
    .string({ error: "Enter an amount" })
    .max(32, "Amount is too long")
    .superRefine((v, ctx) => {
      try {
        (allowZero ? parseAmountOrZero : parseAmount)(v);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Invalid amount" });
      }
    });

const date = z
  .string({ error: "Choose a date" })
  .refine(isValidCalendarDate, "Use a real date in YYYY-MM-DD form")
  .refine((v) => !isValidCalendarDate(v) || isInSupportedRange(v), "Date is outside the supported range (2000–2100)");

const name = z.string({ error: "Enter a name" }).trim().min(1, "Enter a name").max(80, "Keep the name under 80 characters");

export const createGoalSchema = z
  .object({
    name,
    target: money(false),
    startingAmount: money(true).nullish().transform((v) => v || "0"),
    targetDate: date.nullish().transform((v) => v || null),
  })
  .strict();

export const updateGoalSchema = z
  .object({
    name,
    target: money(false),
    startingAmount: money(true).transform((v) => v || "0"),
    targetDate: date.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const contributionSchema = z
  .object({
    amount: money(false),
    contributedOn: date,
    note: z.string().trim().max(200, "Keep the note under 200 characters").nullish().transform((v) => v || null),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid idempotency key").optional(),
  })
  .strict();

export type CreateGoalInput = z.input<typeof createGoalSchema>;
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;
export type ContributionInput = z.input<typeof contributionSchema>;
