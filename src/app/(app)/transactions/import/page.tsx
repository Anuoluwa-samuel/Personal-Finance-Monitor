import Link from "next/link";
import { ImportForm } from "@/components/transactions/import-form";
import { FormMessage } from "@/components/ui/field";
import { IMPORT_MAX_BYTES } from "@/server/import";
import { IMPORT_MAX_ROWS } from "@/server/domain/import-rows";

export const metadata = { title: "Import transactions · Ispentit" };

const PROBLEMS: Record<string, string> = {
  expired: "That preview has expired. Upload the file again to review it.",
  missing: "That preview was not found. Upload the file again.",
  failed: "The import could not be completed and nothing was imported. Try again.",
};

export default async function ImportPage({ searchParams }: PageProps<"/transactions/import">) {
  const { problem } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/transactions" className="text-sm underline">← Transactions</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Import transactions from CSV</h1>
      {typeof problem === "string" && problem in PROBLEMS ? <FormMessage kind="error">{PROBLEMS[problem]}</FormMessage> : null}
      <section className="space-y-2 text-sm text-muted">
        <p>
          Required columns: <code>Date</code> (YYYY-MM-DD), <code>Type</code> (income or expense), <code>Amount</code>, <code>Description</code>,{" "}
          <code>Category</code> (must match one of your existing categories of that type). Optional: <code>Notes</code>, <code>Currency</code> (NGN only).
          Files exported from Ispentit import as they are.
        </p>
        <p>
          Up to {IMPORT_MAX_ROWS.toLocaleString("en-GB")} rows and {IMPORT_MAX_BYTES / 1024} KB per file, UTF-8. Formulas in a file are never run; they are saved as plain text.
          If any row is invalid nothing is imported and every problem is listed. Re-importing a file skips rows imported before. Rows you typed by hand cannot be
          recognised as duplicates.
        </p>
      </section>
      <ImportForm />
    </div>
  );
}
