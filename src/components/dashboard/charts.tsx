"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth, formatShortDay } from "@/lib/format";

/**
 * Chart values are converted to JS numbers for DRAWING ONLY. Every exact figure
 * the user relies on is shown as text from the server-computed decimal strings.
 */
type Point = { bucket: string; income: number; expense: number; net: number };

const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

const axisProps = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;

export function IncomeExpenseChart({
  points,
  granularity,
  label,
}: {
  points: Point[];
  granularity: "day" | "month";
  label: string;
}) {
  const tick = (b: string) => (granularity === "day" ? formatShortDay(b) : formatMonth(b));
  return (
    <div role="img" aria-label={label} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={tick} interval="preserveStartEnd" minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} width={48} {...axisProps} />
          <Tooltip
            formatter={(v) => full.format(Number(v))}
            labelFormatter={(b) => tick(String(b))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Legend />
          <Bar dataKey="income" name="Income" fill="var(--income)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" name="Expenses" fill="var(--expense)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetFlowChart({ points, label }: { points: Point[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={formatMonth} interval="preserveStartEnd" minTickGap={16} {...axisProps} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} width={48} {...axisProps} />
          <Tooltip
            formatter={(v) => full.format(Number(v))}
            labelFormatter={(b) => formatMonth(String(b))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Bar dataKey="net" name="Net cash flow" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {points.map((p) => (
              <Cell key={p.bucket} fill={p.net >= 0 ? "var(--income)" : "var(--expense)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
