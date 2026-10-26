import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContributionForm } from "@/components/goals/contribution-form";
import { GoalProgress } from "@/components/goals/goal-progress";
import { DeleteButton } from "@/components/transactions/delete-button";
import { secondaryButtonClass } from "@/components/ui/field";
import { AppError } from "@/lib/errors";
import { formatDay, money } from "@/lib/format";
import { daysBetween, todayIn } from "@/server/domain/periods";
import { getPreferences } from "@/server/preferences";
import { getGoal } from "@/server/savings";
import { requireUserId } from "@/server/session";
import {
  addContributionAction, archiveGoalAction, completeGoalAction, deleteContributionAction, deleteGoalAction, reopenGoalAction, restoreGoalAction,
} from "../actions";

export const metadata = { title: "Savings goal · Ispentit" };

const Action = ({ action, children }: { action: () => Promise<void>; children: React.ReactNode }) => (
  <form action={action}>
    <button type="submit" className={secondaryButtonClass}>{children}</button>
  </form>
);

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  const g = await getGoal(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  const { timezone } = await getPreferences(userId);
  const today = todayIn(timezone, new Date());
  const left = g.targetDate ? daysBetween(today, g.targetDate) : null;
  const active = g.status === "active";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/goals" className="text-sm underline">← Savings goals</Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {g.name}
          {g.status !== "active" ? <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted">{g.status === "completed" ? "Completed" : "Archived"}</span> : null}
        </h1>
        {g.targetDate ? (
          <p className="text-muted">
            Target date {formatDay(g.targetDate)}
            {active && left !== null ? ` (${left > 0 ? `${left} ${left === 1 ? "day" : "days"} left` : left === 0 ? "today" : `${-left} ${left === -1 ? "day" : "days"} ago`})` : ""}
          </p>
        ) : null}
      </header>

      <section aria-label="Progress" className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <GoalProgress goal={g} />
        <p className="text-sm text-muted">
          Includes {money(g.startingAmount)} you had already saved and {money(g.progress.contributed)} in contributions. These are
          planning records and do not verify that money moved.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        {active ? (
          <>
            <Link href={`/goals/${g.id}/edit`} className={secondaryButtonClass}>Edit</Link>
            <Action action={completeGoalAction.bind(null, g.id)}>Mark complete</Action>
          </>
        ) : null}
        {g.status === "completed" ? <Action action={reopenGoalAction.bind(null, g.id)}>Reopen</Action> : null}
        {g.status === "archived" ? <Action action={restoreGoalAction.bind(null, g.id)}>Restore</Action> : null}
        {g.status !== "archived" ? <Action action={archiveGoalAction.bind(null, g.id)}>Archive</Action> : null}
        <DeleteButton
          action={deleteGoalAction.bind(null, g.id)}
          title="Delete this goal?"
          body={`“${g.name}” and its ${g.contributions.length} ${g.contributions.length === 1 ? "contribution" : "contributions"} will be removed permanently. This cannot be undone. Archive it instead to keep the history.`}
        />
      </div>

      {active ? (
        <section aria-labelledby="add" className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 id="add" className="text-lg font-semibold">Record a contribution</h2>
          {g.progress.reached ? (
            <p className="text-muted">This goal has reached its target. Mark it complete, or edit the target to keep going.</p>
          ) : (
            <>
              <p className="text-sm text-muted">Up to {money(g.progress.remaining)} can be added before the target is reached.</p>
              <ContributionForm action={addContributionAction.bind(null, g.id)} defaultDate={today} idempotencyKey={randomUUID()} />
            </>
          )}
        </section>
      ) : null}

      <section aria-labelledby="hist" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="hist" className="text-lg font-semibold">Contribution history</h2>
        {g.contributions.length === 0 ? (
          <p className="py-6 text-muted">No contributions recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Note</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                  {active ? <th scope="col" className="py-2"><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {g.contributions.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="whitespace-nowrap py-2 pr-3">{formatDay(c.contributedOn)}</td>
                    <td className="py-2 pr-3">{c.note ?? <span className="text-muted">None</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">+{money(c.amount)}</td>
                    {active ? (
                      <td className="py-2 text-right">
                        <DeleteButton
                          action={deleteContributionAction.bind(null, g.id, c.id)}
                          triggerLabel="Remove"
                          title="Remove this contribution?"
                          body={`The ${money(c.amount)} contribution from ${formatDay(c.contributedOn)} will be removed and the goal's progress will go down.`}
                          confirmLabel="Yes, remove"
                          cancelLabel="Keep it"
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
