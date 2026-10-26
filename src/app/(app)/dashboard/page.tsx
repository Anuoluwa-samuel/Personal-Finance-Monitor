import Link from "next/link";
import { buttonClass } from "@/components/ui/field";
import { AppError } from "@/lib/errors";
import { formatDay, formatMonth, formatShortDay, money } from "@/lib/format";
import { getDashboard, type DashboardData } from "@/server/analytics";
import { getActiveBudgetForMonth } from "@/server/budgets";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { todayIn } from "@/server/domain/periods";
import { formatMonthLong } from "@/lib/format";
import { countPending, generateOccurrences } from "@/server/recurring";
import { getSavingsSummary } from "@/server/savings";
import { GoalProgress } from "@/components/goals/goal-progress";
import { listTransactions } from "@/server/transactions";
import { requireUserId } from "@/server/session";
import { decimalToMinor } from "@/server/domain/money";
import { IncomeExpenseChart, NetFlowChart } from "@/components/dashboard/charts";
import { ChartData } from "@/components/dashboard/data-table";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { StatCard } from "@/components/dashboard/stat-card";
import { FormMessage } from "@/components/ui/field";

export const metadata = { title: "Dashboard · Ispentit" };

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const num = (s: string) => Number(s); // chart drawing only; exact values are shown as text

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const userId = await requireUserId();

  let data: DashboardData;
  let notice: string | null = null;
  try {
    data = await getDashboard(userId, { preset: first(sp.period), from: first(sp.from), to: first(sp.to) });
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "VALIDATION") throw e;
    notice = e.message;
    data = await getDashboard(userId, {});
  }
  const recent = await listTransactions(userId, { pageSize: 8 });
  const thisMonth = todayIn(data.timezone, new Date());
  const currentBudget = await getActiveBudgetForMonth(userId, thisMonth);
  await generateOccurrences({ userId });
  const waiting = await countPending(userId);
  const savings = await getSavingsSummary(userId, data.period.from, data.period.to);

  const { period, totals, currency } = data;
  const m = (v: string) => money(v, currency);
  const net = decimalToMinor(totals.net, currency);
  const hasPeriodData = totals.incomeCount + totals.expenseCount > 0;
  const hasAnyData = recent.total > 0;

  const seriesPoints = data.series.points.map((p) => ({ bucket: p.bucket, income: num(p.income), expense: num(p.expense), net: num(p.net) }));
  const monthlyPoints = data.monthly.map((p) => ({ bucket: p.bucket, income: num(p.income), expense: num(p.expense), net: num(p.net) }));
  const bucketLabel = (b: string) => (data.series.granularity === "day" ? formatShortDay(b) : formatMonth(b));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted">
          Showing <strong className="text-foreground">{period.label}</strong> ({formatDay(period.from)} to {formatDay(period.to)}, calendar days in {data.timezone}).
        </p>
      </header>

      <PeriodFilter active={period.preset} from={period.from} to={period.to} />
      {notice ? <FormMessage kind="error">{notice} Showing this month instead.</FormMessage> : null}

      {waiting > 0 ? (
        <p role="status" className="rounded-md border border-border bg-surface px-3 py-3 text-sm">
          {waiting} recurring {waiting === 1 ? "item is" : "items are"} waiting for you to confirm or skip. They are not counted in these figures yet.{" "}
          <Link href="/recurring" className="underline">Review</Link>
        </p>
      ) : null}

      {!hasAnyData ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <h2 className="font-medium">No transactions recorded yet</h2>
          <p className="mt-1 text-muted">
            Totals and charts are calculated from the transactions you record. Nothing here is sample data.
          </p>
          <Link href="/transactions/new" className={`${buttonClass} mt-3`}>
            Add your first transaction
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="overview" className="space-y-3">
        <h2 id="overview" className="text-lg font-semibold">
          Overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Recorded balance"
            value={m(data.recordedBalance)}
            definition="Opening balances of your accounts plus all-time recorded income minus expenses. Not a bank balance: it only reflects what you have entered."
          />
          <StatCard
            title="Income"
            value={m(totals.income)}
            tone="income"
            hint={`${totals.incomeCount} ${totals.incomeCount === 1 ? "entry" : "entries"}`}
            definition={`Income recorded in ${period.label}.`}
          />
          <StatCard
            title="Expenses"
            value={m(totals.expense)}
            tone="expense"
            hint={`${totals.expenseCount} ${totals.expenseCount === 1 ? "entry" : "entries"}`}
            definition={`Expenses recorded in ${period.label}.`}
          />
          <StatCard
            title="Net cash flow"
            value={m(totals.net)}
            tone={net > 0n ? "income" : net < 0n ? "expense" : undefined}
            hint={net > 0n ? "Surplus (income above expenses)" : net < 0n ? "Deficit (expenses above income)" : "Break-even"}
            definition="Income minus expenses for the period. A surplus is not the same as money saved."
          />
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium text-muted">Budget for {formatMonthLong(thisMonth.slice(0, 7) + "-01")} (current month, whatever period is selected)</h3>
          {currentBudget ? (
            <div className="space-y-4">
              {currentBudget.overall ? <BudgetProgress label="Overall" p={currentBudget.overall} /> : null}
              {currentBudget.lines
                .filter((l) => l.status !== "ok" || !currentBudget.overall)
                .slice(0, 3)
                .map((l) => <BudgetProgress key={l.categoryId} label={l.categoryName} p={l} />)}
              <Link href={`/budgets/${currentBudget.id}`} className="inline-flex min-h-11 items-center underline">View budget</Link>
            </div>
          ) : (
            <p className="text-muted">
              No budget set for this month. <Link href="/budgets/new" className="underline">Create one</Link>.
            </p>
          )}
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium text-muted">Savings goals</h3>
          <p>
            <span className="text-xl font-semibold tabular-nums">{m(savings.contributedInPeriod)}</span>{" "}
            <span className="text-muted">
              set aside in {period.label} across {savings.contributionCount} {savings.contributionCount === 1 ? "contribution" : "contributions"}.
              Planning records: not deducted from your balance, and not a bank transfer.
            </span>
          </p>
          {savings.activeGoals.length ? (
            <ul className="space-y-4">
              {savings.activeGoals.map((g) => (
                <li key={g.id} className="space-y-1">
                  <Link href={`/goals/${g.id}`} className="font-medium underline">{g.name}</Link>
                  <GoalProgress goal={g} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No active savings goals. <Link href="/goals/new" className="underline">Create one</Link>.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="trend" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="trend" className="text-lg font-semibold">
          Income and expenses
        </h2>
        <p className="text-sm text-muted">By {data.series.granularity} for {period.label}.</p>
        {hasPeriodData ? (
          <IncomeExpenseChart
            points={seriesPoints}
            granularity={data.series.granularity}
            label={`Bar chart of income and expenses by ${data.series.granularity} for ${period.label}. Totals: income ${m(totals.income)}, expenses ${m(totals.expense)}.`}
          />
        ) : (
          <p className="py-8 text-muted">No income or expenses recorded in this period.</p>
        )}
        {hasPeriodData ? (
          <ChartData
            summary={`Income ${m(totals.income)} and expenses ${m(totals.expense)} in ${period.label}.`}
            headers={[data.series.granularity === "day" ? "Day" : "Month", "Income", "Expenses"]}
            rows={data.series.points.filter((p) => p.income !== "0.00" || p.expense !== "0.00").map((p) => [bucketLabel(p.bucket), m(p.income), m(p.expense)])}
          />
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cats" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="cats" className="text-lg font-semibold">
            Where the money went
          </h2>
          <p className="text-sm text-muted">Expenses by category, {period.label}.</p>
          {data.expenseByCategory.length === 0 ? (
            <p className="py-8 text-muted">No expenses recorded in this period.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.expenseByCategory.map((c) => (
                <li key={c.categoryId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums">
                      {m(c.amount)} <span className="text-muted">({c.sharePercent.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <div className="h-full bg-expense" style={{ width: `${Math.max(c.sharePercent, 1)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="monthly" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="monthly" className="text-lg font-semibold">
            Monthly cash flow
          </h2>
          <p className="text-sm text-muted">Net cash flow for the last 12 months. Above zero is a surplus, below is a deficit.</p>
          {data.monthly.every((p) => p.income === "0.00" && p.expense === "0.00") ? (
            <p className="py-8 text-muted">No transactions in the last 12 months.</p>
          ) : (
            <NetFlowChart
              points={monthlyPoints}
              label={`Bar chart of net cash flow for each of the last 12 months, from ${formatMonth(data.monthly[0].bucket)} to ${formatMonth(data.monthly[11].bucket)}.`}
            />
          )}
          <ChartData
            summary="Income, expenses and net cash flow for each of the last 12 months."
            headers={["Month", "Income", "Expenses", "Net"]}
            rows={data.monthly.map((p) => [formatMonth(p.bucket), m(p.income), m(p.expense), m(p.net)])}
          />
        </section>
      </div>

      <section aria-labelledby="recent" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="recent" className="text-lg font-semibold">
          Recent transactions
        </h2>
        <p className="text-sm text-muted">
          Your latest records across all dates, newest first. <Link href="/transactions" className="underline">View all</Link>
        </p>
        {recent.items.length === 0 ? (
          <p className="py-8 text-muted">Nothing recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                  <th scope="col" className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.items.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDay(t.transactionDate)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/transactions/${t.id}`} className="inline-flex min-h-11 items-center underline">{t.description}</Link>
                    </td>
                    <td className="py-2 pr-3">{t.categoryName}</td>
                    <td className="py-2 pr-3">{t.kind === "income" ? "Income" : "Expense"}</td>
                    <td className={`py-2 text-right tabular-nums ${t.kind === "income" ? "text-income" : "text-expense"}`}>
                      {t.kind === "income" ? "+" : "−"}
                      {m(t.amount)}
                    </td>
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
