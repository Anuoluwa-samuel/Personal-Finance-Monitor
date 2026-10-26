import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-muted min-h-11";

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-base font-medium text-accent-foreground disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-base font-medium text-foreground";

export function Field({
  label,
  id,
  hint,
  ...input
}: { label: string; id: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={id} className={inputClass} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Screen-reader-announced status line for form errors and confirmations. */
export function FormMessage({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${
        kind === "error" ? "border-expense text-expense" : "border-border text-foreground"
      }`}
    >
      {children}
    </p>
  );
}
