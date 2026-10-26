import { z } from "zod";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/server/domain/category-style";
import { flowTypeSchema } from "./transaction";

const name = z
  .string({ error: "Enter a name" })
  .trim()
  .min(1, "Enter a name")
  .max(40, "Keep the name under 40 characters")
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Name contains invalid characters");

const icon = z.enum(CATEGORY_ICONS, { error: "Choose an icon from the list" }).nullable();
const color = z
  .string()
  .refine((v) => CATEGORY_COLORS.some((c) => c.hex === v), "Choose a colour from the list")
  .nullable();

export const createCategorySchema = z
  .object({ type: flowTypeSchema, name, icon: icon.optional().default(null), color: color.optional().default(null) })
  .strict();

/** The type of a category cannot change: history would change meaning. */
export const updateCategorySchema = z
  .object({ name, icon, color })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
