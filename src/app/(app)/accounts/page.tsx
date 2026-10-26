import Link from "next/link";
import { AccountForm } from "@/components/accounts/account-form";
import { secondaryButtonClass } from "@/components/ui/field";
import { money } from "@/lib/format";
import { listAccounts } from "@/server/accounts";
import { requireUserId } from "@/server/session";
import { createAccountAction, setAccountArchivedAction } from "./actions";

export const metadata = { title: "Accounts · Ispentit" };

export default async function AccountsPage() {
  const userId = await requireUserId();
  const accounts = await listAccounts(userId);
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="max-w-prose text-muted">
          Optional. Use accounts to see how much each wallet or bank account holds according to what you recorded. A balance here is
          opening balance + income − expenses recorded against the account; it is not read from your bank and may differ from it.
          Moving money between your own accounts is not supported yet, so record it as nothing rather than as income and expense.
        </p>
      </header>

      <section aria-labelledby="add" className="max-w-lg space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="add" className="text-lg font-semibold">Add an account</h2>
        <AccountForm action={createAccountAction} initial={{ name: "", openingBalance: "" }} submitLabel="Add account" />
      </section>

      {accounts.length === 0 ? (
        <p className="text-muted">No accounts yet. Transactions without an account still count in your overall recorded balance.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className={`font-medium ${a.archived ? "text-muted" : ""}`}>
                  {a.name} {a.archived ? <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-xs font-normal">Archived</span> : null}
                </p>
                <p className="text-sm text-muted">
                  Opening {money(a.openingBalance)} · {a.transactionCount} {a.transactionCount === 1 ? "transaction" : "transactions"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold tabular-nums">{money(a.balance)}</span>
                {!a.archived ? <Link href={`/accounts/${a.id}/edit`} className={secondaryButtonClass}>Edit<span className="sr-only"> {a.name}</span></Link> : null}
                <form action={setAccountArchivedAction.bind(null, a.id, !a.archived)}>
                  <button type="submit" className={secondaryButtonClass}>{a.archived ? "Restore" : "Archive"}<span className="sr-only"> {a.name}</span></button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
