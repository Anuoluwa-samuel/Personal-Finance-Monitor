import Link from "next/link";
import { DeleteButton } from "@/components/transactions/delete-button";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui/field";
import { formatDay, money } from "@/lib/format";
import { generateOccurrences, listPending, listRules } from "@/server/recurring";
import { requireUserId } from "@/server/session";
import { confirmOccurrenceAction, deleteRuleAction, pauseRuleAction, resumeRuleAction, skipOccurrenceAction } from "./actions";

export const metadata = { title: "Recurring · Ispentit" };

const every = (f: string, n: number) => `Every ${n === 1 ? "" : n + " "}${f === "weekly" ? "week" : f === "monthly" ? "month" : "year"}${n === 1 ? "" : "s"}`;

export default async function RecurringPage() {
  const userId = await requireUserId();
  await generateOccurrences({ userId }); // also runs on a schedule; this keeps the page current without it
  const [pending, rules] = await Promise.all([listPending(userId), listRules(userId)]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="max-w-prose text-muted">
            Rules for things that repeat. When one falls due it appears below as <strong>planned</strong>. Planned items are not counted in your
            totals, budgets or balance until you confirm them, because a date passing does not mean the money moved.
          </p>
        </div>
        <Link href="/recurring/new" className={buttonClass}>New rule</Link>
      </header>

      <section aria-labelledby="due" className="space-y-3">
        <h2 id="due" className="text-lg font-semibold">Waiting for you ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-muted">Nothing is waiting. Planned items appear here when a rule falls due.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{p.description} <span className="font-normal text-muted">· {p.categoryName} · planned for {formatDay(p.scheduledFor)}</span></p>
                  <p className={`tabular-nums ${p.kind === "income" ? "text-income" : "text-expense"}`}>{p.kind === "income" ? "+" : "−"}{money(p.amount)}</p>
                </div>
                <form action={confirmOccurrenceAction.bind(null, p.id)} className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`amt-${p.id}`} className="block text-sm">Actual amount</label>
                    <input id={`amt-${p.id}`} name="amount" inputMode="decimal" defaultValue={p.amount} className={`${inputClass} w-40`} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`dt-${p.id}`} className="block text-sm">Date it happened</label>
                    <input id={`dt-${p.id}`} name="transactionDate" type="date" defaultValue={p.scheduledFor} className={inputClass} />
                  </div>
                  <button type="submit" className={buttonClass}>{p.kind === "income" ? "Confirm received" : "Confirm paid"}</button>
                </form>
                <form action={skipOccurrenceAction.bind(null, p.id)}>
                  <button type="submit" className={secondaryButtonClass}>Skip this one<span className="sr-only"> ({p.description}, {formatDay(p.scheduledFor)})</span></button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rules" className="space-y-3">
        <h2 id="rules" className="text-lg font-semibold">Rules</h2>
        {rules.length === 0 ? (
          <p className="text-muted">No recurring rules yet. Examples: rent, salary, a subscription.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {r.description} {r.status === "paused" ? <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-xs font-normal">Paused</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {r.kind === "income" ? "Income" : "Expense"} {money(r.amount)} · {every(r.frequency, r.intervalCount)} from {formatDay(r.startDate)}
                    {r.endDate ? ` until ${formatDay(r.endDate)}` : ""} · {r.nextDue ? (r.status === "paused" ? "paused" : `next ${formatDay(r.nextDue)}`) : "finished"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/recurring/${r.id}/edit`} className={secondaryButtonClass}>Edit<span className="sr-only"> {r.description}</span></Link>
                  <form action={(r.status === "paused" ? resumeRuleAction : pauseRuleAction).bind(null, r.id)}>
                    <button type="submit" className={secondaryButtonClass}>{r.status === "paused" ? "Resume" : "Pause"}<span className="sr-only"> {r.description}</span></button>
                  </form>
                  <DeleteButton
                    action={deleteRuleAction.bind(null, r.id)}
                    title="Delete this rule?"
                    body="Planned items still waiting for this rule are removed. Transactions you already confirmed are kept."
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
