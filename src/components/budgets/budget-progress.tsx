import { CircleCheck, OctagonAlert, TriangleAlert, Target } from "lucide-react";
import { money } from "@/lib/format";
import type { ProgressDTO } from "@/server/budgets";

const COPY = {
  ok: { Icon: CircleCheck, tone: "text-income", text: () => "On track" },
  approaching: { Icon: TriangleAlert, tone: "text-warning", text: (p: ProgressDTO) => `Approaching the limit, ${p.percent.toFixed(0)}% used` },
  reached: { Icon: Target, tone: "text-warning", text: () => "Limit reached" },
  over: { Icon: OctagonAlert, tone: "text-expense", text: (p: ProgressDTO) => `Over by ${money(p.remaining.replace("-", ""))}` },
} as const;

/** Status is always conveyed by an icon and words, never by colour alone. */
export function BudgetProgress({ label, p }: { label: string; p: ProgressDTO }) {
  const { Icon, tone, text } = COPY[p.status];
  const width = Math.min(p.percent, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-sm tabular-nums">
          {money(p.spent)} of {money(p.limit)} <span className="text-muted">({p.percent.toFixed(1)}%)</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${money(p.spent)} spent of ${money(p.limit)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        className="h-2.5 overflow-hidden rounded-full bg-border"
      >
        <div className={`h-full ${p.status === "over" ? "bg-expense" : p.status === "ok" ? "bg-income" : "bg-warning"}`} style={{ width: `${width}%` }} />
      </div>
      <p className={`flex items-center gap-1.5 text-sm ${tone}`}>
        <Icon size={16} aria-hidden="true" />
        <span>{text(p)}</span>
        {p.status !== "over" ? <span className="text-muted">· {money(p.remaining)} left</span> : null}
      </p>
    </div>
  );
}
