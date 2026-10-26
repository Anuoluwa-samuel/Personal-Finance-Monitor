"use client";
import Link from "next/link";
import { buttonClass, secondaryButtonClass } from "@/components/ui/field";

/** Shown when a page throws. The message is deliberately generic: internals and database errors are never shown. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-3 rounded-lg border border-expense p-6">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted">We could not show this page. Your records are safe. Try again, or go back to the dashboard.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={buttonClass}>Try again</button>
        <Link href="/dashboard" className={secondaryButtonClass}>Dashboard</Link>
      </div>
    </div>
  );
}
