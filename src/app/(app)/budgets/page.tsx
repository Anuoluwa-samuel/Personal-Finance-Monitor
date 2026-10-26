import Link from "next/link";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { buttonClass } from "@/components/ui/field";
import { formatMonthLong } from "@/lib/format";
import { listBudgets } from "@/server/budgets";
import { requireUserId } from "@/server/session";

export const metadata = { title: "Budgets · Ispentit" };

export default async function BudgetsPage() {
  const userId = await requireUserId();
  const all = await listBudgets(userId);
  const active = all.filter((b) => !b.archived);
  const archived = all.filter((b) => b.archived);

  const card = (b: (typeof all)[number]) => (
    <li key={b.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">
          <Link href={`/budgets/${b.id}`} className="underline">{formatMonthLong(b.month)}</Link>
          {b.archived ? <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted">Archived</span> : null}
        </h3>
        <span className="text-sm text-muted">{b.lines.length} category {b.lines.length === 1 ? "limit" : "limits"}</span>
      </div>
      {b.overall ? <BudgetProgress label="Overall" p={b.overall} /> : <p className="text-sm text-muted">Category limits only. Total spent in the month: see details.</p>}
    </li>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <p className="max-w-prose text-muted">Monthly spending limits. Progress counts expenses only and updates as you add, edit or delete transactions.</p>
        </div>
        <Link href="/budgets/new" className={buttonClass}>New budget</Link>
      </header>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <p className="font-medium">No budgets yet.</p>
          <p className="mt-1 text-muted">Create one to see how spending compares with a limit you choose.</p>
        </div>
      ) : null}

      {active.length ? (
        <section aria-labelledby="active" className="space-y-3">
          <h2 id="active" className="sr-only">Active budgets</h2>
          <ul className="space-y-4">{active.map(card)}</ul>
        </section>
      ) : null}
      {archived.length ? (
        <section aria-labelledby="hist" className="space-y-3">
          <h2 id="hist" className="text-lg font-semibold">Archived budgets</h2>
          <ul className="space-y-4">{archived.map(card)}</ul>
        </section>
      ) : null}
    </div>
  );
}
