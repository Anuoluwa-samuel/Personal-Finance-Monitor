import { db } from "@/db";
import { category } from "@/db/schema";

export const SYSTEM_CATEGORIES = {
  expense: [
    "Food and groceries",
    "Transport",
    "Housing",
    "Utilities",
    "Education",
    "Health",
    "Entertainment",
    "Shopping",
    "Subscriptions",
    "Personal care",
    "Miscellaneous",
  ],
  income: ["Salary", "Freelance income", "Business income", "Allowance", "Gifts", "Other income"],
} as const;

/** Idempotent: safe to run on every deploy. Relies on the case-insensitive unique index. */
export async function ensureSystemCategories(): Promise<void> {
  const rows = (Object.entries(SYSTEM_CATEGORIES) as [keyof typeof SYSTEM_CATEGORIES, readonly string[]][])
    .flatMap(([type, names]) => names.map((name) => ({ userId: null, type, name })));
  await db.insert(category).values(rows).onConflictDoNothing();
}
