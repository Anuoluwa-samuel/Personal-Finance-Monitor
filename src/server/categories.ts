import { and, asc, count, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/validators/category";
import { idSchema } from "@/validators/transaction";

/**
 * Policy (also in the README):
 * - System categories (user_id NULL) are read-only for everyone.
 * - A custom name may not duplicate (case-insensitive) a system or own category of the same type, archived included.
 * - A category's type never changes. Categories are archived, not deleted: archived ones disappear from pickers
 *   but keep labelling their history, and can be restored.
 * - At most MAX_CUSTOM_CATEGORIES custom categories per user.
 */
export const MAX_CUSTOM_CATEGORIES = 100;

export type CategoryDTO = {
  id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  archived: boolean;
  /** This user's transactions in the category. */
  usage: number;
};

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const dupName = () =>
  new AppError("CONFLICT", "A category with that name already exists", { name: "That name is already used" });

export async function listCategories(userId: string): Promise<CategoryDTO[]> {
  const rows = await db
    .select({
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      isSystem: sql<boolean>`${category.userId} is null`,
      archivedAt: category.archivedAt,
      // Columns are written out in full: Drizzle drops the table prefix in single-table selects,
      // which would make "id" below resolve to the transactions table.
      usage: sql<number>`(select count(*)::int from transactions t where t.category_id = "category"."id" and t.user_id = ${userId})`,
    })
    .from(category)
    .where(or(isNull(category.userId), eq(category.userId, userId)))
    .orderBy(asc(category.type), asc(category.name));
  return rows.map(({ archivedAt, ...r }) => ({ ...r, archived: archivedAt !== null }));
}

async function assertNameFree(userId: string, type: "income" | "expense", name: string, exceptId?: string) {
  const clash = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.type, type),
        sql`lower(${category.name}) = lower(${name})`,
        or(isNull(category.userId), eq(category.userId, userId)),
        exceptId ? ne(category.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (clash.length) throw dupName();
}

export async function createCategory(userId: string, raw: CreateCategoryInput): Promise<CategoryDTO> {
  const input = createCategorySchema.parse(raw);
  const [{ n }] = await db
    .select({ n: count() })
    .from(category)
    .where(eq(category.userId, userId));
  if (n >= MAX_CUSTOM_CATEGORIES) {
    throw new AppError("CONFLICT", `You can have up to ${MAX_CUSTOM_CATEGORIES} custom categories. Archive some you no longer use.`);
  }
  await assertNameFree(userId, input.type, input.name);
  try {
    const [row] = await db
      .insert(category)
      .values({ userId, type: input.type, name: input.name, icon: input.icon, color: input.color })
      .returning();
    return { id: row.id, name: row.name, type: row.type, icon: row.icon, color: row.color, isSystem: false, archived: false, usage: 0 };
  } catch (e) {
    if (isUniqueViolation(e)) throw dupName(); // lost a race with a concurrent request
    throw e;
  }
}

/** Loads a category the user may MODIFY: their own. System categories are FORBIDDEN, anyone else's is NOT_FOUND. */
async function ownCategory(userId: string, rawId: string) {
  const id = idSchema.parse(rawId);
  const [row] = await db
    .select()
    .from(category)
    .where(and(eq(category.id, id), or(isNull(category.userId), eq(category.userId, userId))))
    .limit(1);
  if (!row) throw notFound("Category");
  if (row.userId === null) throw new AppError("FORBIDDEN", "Default categories cannot be changed");
  return row;
}

export async function updateCategory(userId: string, rawId: string, raw: UpdateCategoryInput): Promise<void> {
  const patch = updateCategorySchema.parse(raw);
  const current = await ownCategory(userId, rawId);
  if (patch.name !== undefined) await assertNameFree(userId, current.type, patch.name, current.id);
  try {
    await db
      .update(category)
      .set(patch)
      .where(and(eq(category.id, current.id), eq(category.userId, userId)));
  } catch (e) {
    if (isUniqueViolation(e)) throw dupName();
    throw e;
  }
}

export async function setCategoryArchived(userId: string, rawId: string, archived: boolean): Promise<void> {
  const current = await ownCategory(userId, rawId);
  await db
    .update(category)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(category.id, current.id), eq(category.userId, userId)));
}
