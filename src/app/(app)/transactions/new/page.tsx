import { randomUUID } from "node:crypto";
import Link from "next/link";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { listUsableAccounts } from "@/server/accounts";
import { todayIn } from "@/server/domain/periods";
import { getPreferences } from "@/server/preferences";
import { requireUserId } from "@/server/session";
import { listUsableCategories } from "@/server/transactions";
import { createTransactionAction } from "../actions";

export const metadata = { title: "Add transaction · Ispentit" };

export default async function NewTransactionPage() {
  const userId = await requireUserId();
  const [categories, prefs, accounts] = await Promise.all([listUsableCategories(userId), getPreferences(userId), listUsableAccounts(userId)]);
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/transactions" className="text-sm underline">← Transactions</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Add transaction</h1>
      <TransactionForm
        action={createTransactionAction}
        categories={categories}
        accounts={accounts}
        initial={{ kind: "expense", amount: "", description: "", categoryId: "", accountId: "", transactionDate: todayIn(prefs.timezone, new Date()), notes: "" }}
        submitLabel="Save transaction"
        cancelHref="/transactions"
        idempotencyKey={randomUUID()}
      />
    </div>
  );
}
