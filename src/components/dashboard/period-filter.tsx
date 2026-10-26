import Link from "next/link";
import { buttonClass, inputClass } from "@/components/ui/field";
import type { PeriodPreset } from "@/server/domain/periods";

const PRESETS: { id: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "this_year", label: "This year" },
];

export function PeriodFilter({ active, from, to }: { active: PeriodPreset; from: string; to: string }) {
  return (
    <section aria-label="Reporting period" className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const current = p.id === active;
          return (
            <li key={p.id}>
              <Link
                href={`/dashboard?period=${p.id}`}
                aria-current={current ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm ${
                  current ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
                }`}
              >
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <form action="/dashboard" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="period" value="custom" />
        <div className="space-y-1">
          <label htmlFor="from" className="block text-sm font-medium">
            From
          </label>
          <input id="from" name="from" type="date" required defaultValue={from} min="2000-01-01" max="2100-12-31" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="block text-sm font-medium">
            To
          </label>
          <input id="to" name="to" type="date" required defaultValue={to} min="2000-01-01" max="2100-12-31" className={inputClass} />
        </div>
        <button type="submit" className={buttonClass}>
          Apply range
        </button>
      </form>
    </section>
  );
}
