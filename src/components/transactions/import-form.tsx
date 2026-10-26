"use client";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import { formatDay, money } from "@/lib/format";
import { confirmImportAction, discardImportAction, previewImportAction, type ImportState } from "@/app/(app)/transactions/import/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(previewImportAction, null);
  const p = state?.preview;

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="file" className="block text-sm font-medium">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
        </div>
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Checking file…" : "Preview import"}</button>
      </form>

      {state?.error ? <FormMessage kind="error">{state.error}</FormMessage> : null}

      {p && !p.ok ? (
        <section aria-labelledby="errs" className="space-y-3">
          <FormMessage kind="error">{p.message}</FormMessage>
          {p.errors.length ? (
            <>
              <h2 id="errs" className="text-lg font-semibold">
                {p.totalErrors} {p.totalErrors === 1 ? "row has" : "rows have"} problems{p.totalErrors > p.errors.length ? ` (showing the first ${p.errors.length})` : ""}
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                {p.errors.map((e) => (
                  <li key={e.line} className="p-3"><strong>Line {e.line}:</strong> {e.message}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {p && p.ok ? (
        <section aria-labelledby="prev" className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <h2 id="prev" className="text-lg font-semibold">Review before importing</h2>
          <ul className="space-y-1 text-sm">
            <li><strong>{p.newCount}</strong> new {p.newCount === 1 ? "transaction" : "transactions"} will be added{p.from && p.to ? `, dated ${formatDay(p.from)} to ${formatDay(p.to)}` : ""}.</li>
            <li>Income {money(p.income)}, expenses {money(p.expense)}.</li>
            {p.duplicateCount ? <li><strong>{p.duplicateCount}</strong> {p.duplicateCount === 1 ? "row was" : "rows were"} already imported earlier and will be skipped.</li> : null}
          </ul>
          {p.sample.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">First {p.sample.length} rows to import</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                    <th scope="col" className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {p.sample.map((r) => (
                    <tr key={r.line} className="border-b border-border/60">
                      <td className="whitespace-nowrap py-2 pr-3">{formatDay(r.transactionDate)}</td>
                      <td className="py-2 pr-3">{r.description}</td>
                      <td className="py-2 pr-3">{r.categoryName}</td>
                      <td className={`py-2 text-right tabular-nums ${r.kind === "income" ? "text-income" : "text-expense"}`}>{r.kind === "income" ? "+" : "−"}{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {p.batchId ? (
            <div className="flex flex-wrap gap-3">
              <form action={confirmImportAction.bind(null, p.batchId)}>
                <button type="submit" className={buttonClass}>Import {p.newCount} {p.newCount === 1 ? "transaction" : "transactions"}</button>
              </form>
              <form action={discardImportAction.bind(null, p.batchId)}>
                <button type="submit" className={secondaryButtonClass}>Cancel</button>
              </form>
            </div>
          ) : (
            <FormMessage kind="info">Nothing new to import: every row is already in your records.</FormMessage>
          )}
          <p className="text-sm text-muted">Nothing has been saved yet. The preview stays valid for one hour. Importing adds all of these rows together or none of them.</p>
        </section>
      ) : null}
    </div>
  );
}
