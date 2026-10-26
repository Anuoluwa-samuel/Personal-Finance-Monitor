import { CircleCheck, Hourglass } from "lucide-react";
import { money } from "@/lib/format";
import type { GoalDTO } from "@/server/savings";

/** Progress is stated in words and numbers as well as drawn, so it never depends on colour. */
export function GoalProgress({ goal }: { goal: GoalDTO }) {
  const p = goal.progress;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm tabular-nums">
          {money(p.saved)} of {money(goal.target)} <span className="text-muted">({p.percent.toFixed(1)}%)</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${goal.name}: ${money(p.saved)} saved of ${money(goal.target)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(p.percent, 100))}
        className="h-2.5 overflow-hidden rounded-full bg-border"
      >
        <div className={`h-full ${p.reached ? "bg-income" : "bg-accent"}`} style={{ width: `${Math.min(p.percent, 100)}%` }} />
      </div>
      <p className={`flex items-center gap-1.5 text-sm ${p.reached ? "text-income" : "text-muted"}`}>
        {p.reached ? <CircleCheck size={16} aria-hidden="true" /> : <Hourglass size={16} aria-hidden="true" />}
        {p.reached ? "Target reached" : `${money(p.remaining)} to go`}
      </p>
    </div>
  );
}
