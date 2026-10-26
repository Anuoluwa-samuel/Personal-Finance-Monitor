import { z } from "zod";
import { MoneyError, parseAmountOrZero } from "@/server/domain/money";

const name = z
  .string({ error: "Enter a name" })
  .trim()
  .min(1, "Enter a name")
  .max(60, "Keep the name under 60 characters")
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Name contains invalid characters");

const opening = z
  .string({ error: "Enter an amount" })
  .max(32, "Amount is too long")
  .superRefine((v, ctx) => {
    try {
      parseAmountOrZero(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Invalid amount" });
    }
  });

export const createAccountSchema = z
  .object({ name, openingBalance: opening.nullish().transform((v) => v || "0") })
  .strict();

export const updateAccountSchema = z
  .object({ name, openingBalance: opening.transform((v) => v || "0") })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type CreateAccountInput = z.input<typeof createAccountSchema>;
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;
