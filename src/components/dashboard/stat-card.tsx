import type { ReactNode } from "react";

export function StatCard({
  title,
  value,
  definition,
  tone,
  hint,
}: {
  title: string;
  value: string;
  definition: string;
  tone?: "income" | "expense";
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
          tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm font-medium">{hint}</p> : null}
      <p className="mt-2 text-sm text-muted">{definition}</p>
    </div>
  );
}
