import Link from "next/link";
import { GoalProgress } from "@/components/goals/goal-progress";
import { buttonClass } from "@/components/ui/field";
import { formatDay } from "@/lib/format";
import { listGoals, type GoalDTO } from "@/server/savings";
import { requireUserId } from "@/server/session";

export const metadata = { title: "Savings goals · Ispentit" };

function Card({ g }: { g: GoalDTO }) {
  return (
    <li className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">
          <Link href={`/goals/${g.id}`} className="underline">{g.name}</Link>
        </h3>
        {g.targetDate ? <span className="text-sm text-muted">Target date {formatDay(g.targetDate)}</span> : null}
      </div>
      <GoalProgress goal={g} />
    </li>
  );
}

export default async function GoalsPage() {
  const userId = await requireUserId();
  const all = await listGoals(userId);
  const sections = [
    { title: "Active", items: all.filter((g) => g.status === "active") },
    { title: "Completed", items: all.filter((g) => g.status === "completed") },
    { title: "Archived", items: all.filter((g) => g.status === "archived") },
  ];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Savings goals</h1>
          <p className="max-w-prose text-muted">
            Contributions here are planning records. They do not move or verify real money, and they are kept separate from
            your income and expenses.
          </p>
        </div>
        <Link href="/goals/new" className={buttonClass}>New goal</Link>
      </header>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <p className="font-medium">No savings goals yet.</p>
          <p className="mt-1 text-muted">Create one for something you are saving towards, such as a laptop, rent or an emergency fund.</p>
        </div>
      ) : null}

      {sections.filter((s) => s.items.length).map((s) => (
        <section key={s.title} aria-label={`${s.title} goals`} className="space-y-3">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <ul className="space-y-4">{s.items.map((g) => <Card key={g.id} g={g} />)}</ul>
        </section>
      ))}
    </div>
  );
}
