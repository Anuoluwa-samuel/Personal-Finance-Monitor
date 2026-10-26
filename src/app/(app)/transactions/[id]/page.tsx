import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/transactions/delete-button";
import { secondaryButtonClass } from "@/components/ui/field";
import { AppError } from "@/lib/errors";
import { formatDay, money } from "@/lib/format";
import { requireUserId } from "@/server/session";
import { getTransaction } from "@/server/transactions";
import { deleteTransactionAction } from "../actions";

export const metadata = { title: "Transaction · Ispentit" };

export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  const userId = await requireUserId();
  const t = await getTransaction(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const rows: [string, React.ReactNode][] = [
    ["Type", t.kind === "income" ? "Income" : "Expense"],
    ["Amount", <span key="a" className={`tabular-nums ${t.kind === "income" ? "text-income" : "text-expense"}`}>{t.kind === "income" ? "+" : "−"}{money(t.amount)}</span>],
    ["Category", t.categoryName],
    ["Account", t.accountName ?? "None"],
    ["Date", formatDay(t.transactionDate)],
    ["Notes", t.notes ?? "None"],
    ["Recorded", when(t.createdAt)],
    ["Last changed", when(t.updatedAt)],
  ];
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/transactions" className="text-sm underline">← Transactions</Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t.description}</h1>
      <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 p-3">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link href={`/transactions/${t.id}/edit`} className={secondaryButtonClass}>Edit</Link>
        <DeleteButton
          action={deleteTransactionAction.bind(null, t.id)}
          title="Delete this transaction?"
          body={`“${t.description}” (${money(t.amount)}) will be removed permanently and your totals will update. This cannot be undone.`}
        />
      </div>
    </div>
  );
}
