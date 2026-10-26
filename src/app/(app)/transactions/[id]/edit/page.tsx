import Link from "next/link";
import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { AppError } from "@/lib/errors";
import { listUsableAccounts } from "@/server/accounts";
import { requireUserId } from "@/server/session";
import { getTransaction, listUsableCategories } from "@/server/transactions";
import { updateTransactionAction } from "../../actions";

export const metadata = { title: "Edit transaction · Ispentit" };

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const t = await getTransaction(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  const usable = await listUsableCategories(userId);
  const usableAccounts = await listUsableAccounts(userId);
  // The current account stays selectable even if archived since.
  const accounts = !t.accountId || usableAccounts.some((a) => a.id === t.accountId) ? usableAccounts : [...usableAccounts, { id: t.accountId, name: `${t.accountName} (archived)` }];
  // The current category stays selectable even if it has since been archived, so editing other fields still works.
  const categories = usable.some((c) => c.id === t.categoryId)
    ? usable
    : [...usable, { id: t.categoryId, name: `${t.categoryName} (archived)`, type: t.kind, isSystem: false }];
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href={`/transactions/${t.id}`} className="text-sm underline">← Back to transaction</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit transaction</h1>
      <TransactionForm
        action={updateTransactionAction.bind(null, t.id)}
        categories={categories}
        accounts={accounts}
        initial={{ kind: t.kind, amount: t.amount, description: t.description, categoryId: t.categoryId, accountId: t.accountId ?? "", transactionDate: t.transactionDate, notes: t.notes ?? "" }}
        submitLabel="Save changes"
        cancelHref={`/transactions/${t.id}`}
      />
    </div>
  );
}
