import Link from "next/link";
import { BudgetForm } from "@/components/budgets/budget-form";
import { todayIn } from "@/server/domain/periods";
import { getPreferences } from "@/server/preferences";
import { requireUserId } from "@/server/session";
import { listUsableCategories } from "@/server/transactions";
import { createBudgetAction } from "../actions";

export const metadata = { title: "New budget · Ispentit" };

export default async function NewBudgetPage() {
  const userId = await requireUserId();
  const [cats, prefs] = await Promise.all([listUsableCategories(userId), getPreferences(userId)]);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/budgets" className="text-sm underline">← Budgets</Link>
      <h1 className="text-2xl font-semibold tracking-tight">New budget</h1>
      <BudgetForm
        action={createBudgetAction}
        categories={cats.filter((c) => c.type === "expense")}
        initial={{ month: todayIn(prefs.timezone, new Date()).slice(0, 7), overallLimit: "", lines: [] }}
        monthEditable
        submitLabel="Create budget"
        cancelHref="/budgets"
      />
    </div>
  );
}
