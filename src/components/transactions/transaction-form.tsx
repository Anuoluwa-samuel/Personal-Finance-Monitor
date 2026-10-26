"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import type { FormState } from "@/server/form";

export type CategoryOption = { id: string; name: string; type: "income" | "expense" };

type Initial = {
  kind: "income" | "expense";
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  transactionDate: string;
  notes: string;
};

export function TransactionForm({
  action,
  categories,
  accounts,
  initial,
  submitLabel,
  cancelHref,
  idempotencyKey,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  initial: Initial;
  submitLabel: string;
  cancelHref: string;
  /** Present only when creating: makes an accidental double submit safe. */
  idempotencyKey?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? initial;
  const [kind, setKind] = useState<"income" | "expense">((v.kind as "income" | "expense") || "expense");
  const [categoryId, setCategoryId] = useState(v.categoryId);
  const options = categories.filter((c) => c.type === kind);
  const err = state?.fields ?? {};

  const field = (name: string) => ({
    "aria-invalid": err[name] ? true : undefined,
    "aria-describedby": err[name] ? `${name}-error` : undefined,
  });
  const errorText = (name: string) =>
    err[name] ? (
      <p id={`${name}-error`} className="text-sm text-expense">
        {err[name]}
      </p>
    ) : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {idempotencyKey ? <input type="hidden" name="idempotencyKey" value={idempotencyKey} /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type</legend>
        <div className="flex gap-3">
          {(["expense", "income"] as const).map((k) => (
            <label
              key={k}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border px-3 text-base ${
                kind === k ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  if (categories.find((c) => c.id === categoryId)?.type !== k) setCategoryId("");
                }}
                className="sr-only"
              />
              {k === "expense" ? "Expense" : "Income"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="amount" className="block text-sm font-medium">
          Amount (NGN)
        </label>
        <input id="amount" name="amount" inputMode="decimal" autoComplete="off" defaultValue={v.amount} className={inputClass} placeholder="1500.00" required {...field("amount")} />
        {errorText("amount")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <input id="description" name="description" maxLength={200} defaultValue={v.description} className={inputClass} required {...field("description")} />
        {errorText("description")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="categoryId" className="block text-sm font-medium">
          Category
        </label>
        <select id="categoryId" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass} required {...field("categoryId")}>
          <option value="">Choose a category</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errorText("categoryId")}
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-1.5">
          <label htmlFor="accountId" className="block text-sm font-medium">
            Account <span className="font-normal text-muted">(optional)</span>
          </label>
          <select id="accountId" name="accountId" defaultValue={v.accountId ?? ""} className={inputClass} {...field("accountId")}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {errorText("accountId")}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="transactionDate" className="block text-sm font-medium">
          Date
        </label>
        <input id="transactionDate" name="transactionDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={v.transactionDate} className={inputClass} required {...field("transactionDate")} />
        {errorText("transactionDate")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={v.notes} className={inputClass} {...field("notes")} />
        {errorText("notes")}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
