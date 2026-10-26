import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ensureSystemCategories } from "@/db/seed-categories";
import { category, user } from "@/db/schema";

if (!process.env.DATABASE_URL?.endsWith("_test")) {
  throw new Error("Refusing to run integration tests: DATABASE_URL must point at a *_test database");
}

export async function createTestUser(): Promise<string> {
  const id = `test_${randomUUID()}`;
  await db.insert(user).values({ id, name: "Test", email: `${id}@example.test`, emailVerified: true });
  return id;
}

export async function deleteTestUsers(ids: string[]) {
  if (ids.length) await db.delete(user).where(inArray(user.id, ids));
}

export async function systemCategoryId(type: "income" | "expense", name: string): Promise<string> {
  await ensureSystemCategories();
  const rows = await db.select().from(category).where(eq(category.type, type));
  const found = rows.find((c) => c.userId === null && c.name === name);
  if (!found) throw new Error(`System category missing: ${name}`);
  return found.id;
}
