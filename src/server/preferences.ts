import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { isValidTimezone } from "./domain/periods";
import { DEFAULT_CURRENCY, type CurrencyCode } from "./domain/money";

export type Preferences = { currency: CurrencyCode; timezone: string };

/** Returns the user's preferences, creating the default row on first use. Safe under concurrent calls. */
export async function getPreferences(userId: string): Promise<Preferences> {
  await db.insert(userPreferences).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  // A stored timezone that the runtime no longer recognises must not break every report.
  const timezone = isValidTimezone(row.timezone) ? row.timezone : "Africa/Lagos";
  return { currency: DEFAULT_CURRENCY, timezone };
}

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export async function getTheme(userId: string): Promise<Theme> {
  const [row] = await db.select({ theme: userPreferences.theme }).from(userPreferences).where(eq(userPreferences.userId, userId));
  return (THEMES as readonly string[]).includes(row?.theme ?? "") ? (row!.theme as Theme) : "system";
}

export const preferencesSchema = z
  .object({
    timezone: z
      .string({ error: "Choose a timezone" })
      .max(64)
      .refine(isValidTimezone, "Choose a timezone from the list"),
    theme: z.enum(THEMES, { error: "Choose a theme" }),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Updates the user's own preferences (creating the row if needed). Allowlisted fields only. */
export async function updatePreferences(userId: string, raw: z.input<typeof preferencesSchema>): Promise<void> {
  const patch = preferencesSchema.parse(raw);
  await db.insert(userPreferences).values({ userId, ...patch }).onConflictDoUpdate({ target: userPreferences.userId, set: patch });
}
