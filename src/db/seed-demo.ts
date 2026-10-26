// Development only: fills an existing account with generated transactions so the UI and query
// performance can be checked at realistic volumes. Usage: npm run db:seed-demo -- <email> [count]
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { category, transactions, user } from "@/db/schema";
import { ensureSystemCategories } from "./seed-categories";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
  const email = process.argv[2];
  const count = Math.min(Number(process.argv[3] ?? 600), 200_000);
  if (!email || !Number.isInteger(count) || count < 1) throw new Error("Usage: db:seed-demo -- <email> [count]");

  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) throw new Error("No account with that email. Register and verify it first.");
  await ensureSystemCategories();
  const cats = (await db.select().from(category)).filter((c) => c.userId === null);
  const expense = cats.filter((c) => c.type === "expense");
  const income = cats.filter((c) => c.type === "income");

  const today = new Date();
  const rows = Array.from({ length: count }, (_, i) => {
    const isIncome = i % 9 === 0;
    const pool = isIncome ? income : expense;
    const c = pool[(i * 7) % pool.length];
    const daysAgo = (i * 13) % 540;
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo));
    const kobo = isIncome ? 5_000_000 + ((i * 7919) % 40_000_000) : 50_000 + ((i * 104729) % 4_000_000);
    const amount = `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, "0")}`;
    return {
      userId: u.id,
      kind: c.type,
      amount,
      description: `Demo ${c.type} ${i + 1}`,
      categoryId: c.id,
      transactionDate: d.toISOString().slice(0, 10),
    };
  });
  for (let i = 0; i < rows.length; i += 2000) await db.insert(transactions).values(rows.slice(i, i + 2000));
  console.info(`Inserted ${rows.length} demo transactions for ${email}.`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
