"use client";
import { buttonClass } from "@/components/ui/field";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p role="alert" className="text-muted">Please try again in a moment.</p>
      <button type="button" onClick={reset} className={buttonClass}>Try again</button>
    </main>
  );
}
