import Link from "next/link";
import { ZodError } from "zod";
import { buttonClass, inputClass, FormMessage, secondaryButtonClass } from "@/components/ui/field";
import { formatDay, money } from "@/lib/format";
import { requireUserId } from "@/server/session";
import { listAccounts } from "@/server/accounts";
import { listTransactions, listUsableCategories } from "@/server/transactions";

export const metadata = { title: "Transactions · Ispentit" };

const ORDERS = {
  date_desc: { sort: "date", dir: "desc", label: "Newest first" },
  date_asc: { sort: "date", dir: "asc", label: "Oldest first" },
  amount_desc: { sort: "amount", dir: "desc", label: "Highest amount" },
  amount_asc: { sort: "amount", dir: "asc", label: "Lowest amount" },
} as const;
type Order = keyof typeof ORDERS;

const first = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const userId = await requireUserId();
  const order: Order = (first(sp.order) as Order) in ORDERS ? (first(sp.order) as Order) : "date_desc";
  const filters = {
    q: first(sp.q),
    kind: first(sp.kind),
    categoryId: first(sp.categoryId),
    accountId: first(sp.accountId),
    from: first(sp.from),
    to: first(sp.to),
    page: first(sp.page),
  };

  const categories = await listUsableCategories(userId);
  const accounts = await listAccounts(userId);
  let notice: string | null = null;
  let result;
  try {
    result = await listTransactions(userId, { ...filters, sort: ORDERS[order].sort, dir: ORDERS[order].dir } as never);
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
    notice = e.issues[0]?.message ?? "Those filters are not valid.";
    result = await listTransactions(userId, {});
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, order, page: String(page) })) if (v) p.set(k, v);
    return `/transactions?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries({ q: filters.q, kind: filters.kind, categoryId: filters.categoryId, from: filters.from, to: filters.to }).filter(([, v]) => v) as [string, string][]).toString();
  const filtered = Boolean(filters.q || filters.kind || filters.categoryId || filters.accountId || filters.from || filters.to);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/transactions/import" className={secondaryButtonClass}>
            Import CSV
          </Link>
          <a href={`/api/transactions/export${exportQs ? `?${exportQs}` : ""}`} className={secondaryButtonClass}>
            Export CSV{filtered ? " (filtered)" : ""}
          </a>
          <Link href="/transactions/new" className={buttonClass}>
            Add transaction
          </Link>
        </div>
      </header>

      <form method="get" action="/transactions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter transactions">
        <div className="space-y-1">
          <label htmlFor="q" className="block text-sm font-medium">Search description</label>
          <input id="q" name="q" defaultValue={filters.q} maxLength={100} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="kind" className="block text-sm font-medium">Type</label>
          <select id="kind" name="kind" defaultValue={filters.kind ?? ""} className={inputClass}>
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="categoryId" className="block text-sm font-medium">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""} className={inputClass}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
        </div>
        {accounts.length > 0 ? (
          <div className="space-y-1">
            <label htmlFor="accountId" className="block text-sm font-medium">Account</label>
            <select id="accountId" name="accountId" defaultValue={filters.accountId ?? ""} className={inputClass}>
              <option value="">All</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (archived)" : ""}</option>)}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <label htmlFor="order" className="block text-sm font-medium">Sort by</label>
          <select id="order" name="order" defaultValue={order} className={inputClass}>
            {Object.entries(ORDERS).map(([k, o]) => (
              <option key={k} value={k}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="from" className="block text-sm font-medium">From</label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="block text-sm font-medium">To</label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className={inputClass} />
        </div>
        <div className="flex items-end gap-3 sm:col-span-2">
          <button type="submit" className={buttonClass}>Apply filters</button>
          {filtered ? <Link href="/transactions" className="min-h-11 content-center underline">Clear filters</Link> : null}
        </div>
      </form>

      {/^\d{1,5}$/.test(first(sp.imported) ?? "") ? <FormMessage kind="info">Imported {first(sp.imported)} {first(sp.imported) === "1" ? "transaction" : "transactions"}.</FormMessage> : null}
      {notice ? <FormMessage kind="error">{notice} Showing all transactions instead.</FormMessage> : null}

      <p role="status" className="text-sm text-muted">
        {result.total} {result.total === 1 ? "transaction" : "transactions"}
        {filtered ? " match your filters" : ""}.
      </p>

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6">
          <p className="font-medium">{filtered ? "No transactions match these filters." : "No transactions yet."}</p>
          {!filtered ? (
            <p className="mt-1 text-muted">
              <Link href="/transactions/new" className="underline">Add your first transaction</Link> to see totals and charts.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">Transactions, page {result.page} of {totalPages}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 font-medium">Date</th>
                <th scope="col" className="p-3 font-medium">Description</th>
                <th scope="col" className="p-3 font-medium">Category</th>
                <th scope="col" className="p-3 font-medium">Account</th>
                <th scope="col" className="p-3 font-medium">Type</th>
                <th scope="col" className="p-3 text-right font-medium">Amount</th>
                <th scope="col" className="p-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="whitespace-nowrap p-3">{formatDay(t.transactionDate)}</td>
                  <td className="p-3">
                    <Link href={`/transactions/${t.id}`} className="inline-flex min-h-11 items-center underline">{t.description}</Link>
                  </td>
                  <td className="p-3">{t.categoryName}</td>
                  <td className="p-3">{t.accountName ?? <span className="text-muted">None</span>}</td>
                  <td className="p-3">{t.kind === "income" ? "Income" : "Expense"}</td>
                  <td className={`p-3 text-right tabular-nums ${t.kind === "income" ? "text-income" : "text-expense"}`}>
                    {t.kind === "income" ? "+" : "−"}{money(t.amount)}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/transactions/${t.id}/edit`} className="inline-flex min-h-11 items-center underline">
                      Edit<span className="sr-only"> {t.description}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          {result.page > 1 ? <Link href={qs(result.page - 1)} rel="prev" className="inline-flex min-h-11 items-center underline">Previous</Link> : <span />}
          <span className="text-sm text-muted">Page {result.page} of {totalPages}</span>
          {result.page < totalPages ? <Link href={qs(result.page + 1)} rel="next" className="inline-flex min-h-11 items-center underline">Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
