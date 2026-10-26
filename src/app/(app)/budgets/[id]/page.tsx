import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { DeleteButton } from "@/components/transactions/delete-button";
import { secondaryButtonClass } from "@/components/ui/field";
import { AppError } from "@/lib/errors";
import { formatMonthLong, money } from "@/lib/format";
import { getBudget } from "@/server/budgets";
import { requireUserId } from "@/server/session";
import { archiveBudgetAction } from "../actions";

export const metadata = { title: "Budget · Ispentit" };

export default async function BudgetPage({ params }: PageProps<"/budgets/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  const b = await getBudget(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/budgets" className="text-sm underline">← Budgets</Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {formatMonthLong(b.month)} budget
          {b.archived ? <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted">Archived</span> : null}
        </h1>
        <p className="text-muted">
          Total spent in the month: <strong className="text-foreground">{money(b.totalSpent)}</strong> (all expense categories; income is never counted).
        </p>
      </header>

      <section className="space-y-5 rounded-lg border border-border bg-surface p-4" aria-label="Progress">
        {b.overall ? <BudgetProgress label="Overall" p={b.overall} /> : <p className="text-sm text-muted">No overall limit. Only the category limits below apply.</p>}
        {b.lines.map((l) => (
          <BudgetProgress key={l.categoryId} label={l.categoryArchived ? `${l.categoryName} (archived)` : l.categoryName} p={l} />
        ))}
      </section>

      {!b.archived ? (
        <div className="flex flex-wrap gap-3">
          <Link href={`/budgets/${b.id}/edit`} className={secondaryButtonClass}>Edit limits</Link>
          <DeleteButton
            action={archiveBudgetAction.bind(null, b.id)}
            triggerLabel="Archive"
            confirmLabel="Yes, archive"
            cancelLabel="Cancel"
            title="Archive this budget?"
            body="It moves to your archived budgets and keeps its figures as history. You can then create a new budget for the same month."
          />
        </div>
      ) : null}
    </div>
  );
}
