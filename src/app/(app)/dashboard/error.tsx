"use client";
import { buttonClass } from "@/components/ui/field";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-expense p-6">
      <h1 className="text-lg font-semibold">We could not load your dashboard</h1>
      <p className="text-muted">Your records are safe. Please try again.</p>
      <button type="button" onClick={reset} className={buttonClass}>
        Try again
      </button>
    </div>
  );
}
