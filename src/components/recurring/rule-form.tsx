"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import type { CategoryOption } from "@/components/transactions/transaction-form";
import type { FormState } from "@/server/form";

type V = { kind: string; amount: string; description: string; categoryId: string; accountId: string; frequency: string; intervalCount: string; startDate: string; endDate: string };

export function RuleForm({
  action, categories, accounts, initial, editing, submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  initial: V;
  /** When editing, kind, frequency, interval and start date are fixed. */
  editing: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = (state?.values as V | undefined) ?? initial;
  const [kind, setKind] = useState<"income" | "expense">((v.kind as "income" | "expense") || "expense");
  const [categoryId, setCategoryId] = useState(v.categoryId);
  const err = state?.fields ?? {};
  const a = (n: string) => ({ "aria-invalid": err[n] ? true : undefined, "aria-describedby": err[n] ? `${n}-error` : undefined });
  const e = (n: string) => (err[n] ? <p id={`${n}-error`} className="text-sm text-expense">{err[n]}</p> : null);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {editing ? <p className="text-sm text-muted">Type, schedule and start date cannot be changed. To change them, delete this rule and create a new one.</p> : null}

      <fieldset className="space-y-2" disabled={editing}>
        <legend className="text-sm font-medium">Type</legend>
        <div className="flex gap-3">
          {(["expense", "income"] as const).map((k) => (
            <label key={k} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border px-3 ${kind === k ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} className="sr-only"
                onChange={() => { setKind(k); if (categories.find((c) => c.id === categoryId)?.type !== k) setCategoryId(""); }} />
              {k === "expense" ? "Expense" : "Income"}
            </label>
          ))}
        </div>
        {editing ? <input type="hidden" name="kind" value={kind} /> : null}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">Description</label>
        <input id="description" name="description" maxLength={200} defaultValue={v.description} placeholder="Rent" className={inputClass} required {...a("description")} />
        {e("description")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="amount" className="block text-sm font-medium">Amount (NGN)</label>
        <input id="amount" name="amount" inputMode="decimal" autoComplete="off" defaultValue={v.amount} className={inputClass} required {...a("amount")} />
        <p className="text-sm text-muted">You can change the amount when you confirm each occurrence.</p>
        {e("amount")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="categoryId" className="block text-sm font-medium">Category</label>
        <select id="categoryId" name="categoryId" value={categoryId} onChange={(ev) => setCategoryId(ev.target.value)} className={inputClass} required {...a("categoryId")}>
          <option value="">Choose a category</option>
          {categories.filter((c) => c.type === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {e("categoryId")}
      </div>
      {accounts.length ? (
        <div className="space-y-1.5">
          <label htmlFor="accountId" className="block text-sm font-medium">Account <span className="font-normal text-muted">(optional)</span></label>
          <select id="accountId" name="accountId" defaultValue={v.accountId} className={inputClass} {...a("accountId")}>
            <option value="">No account</option>
            {accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {e("accountId")}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="intervalCount" className="block text-sm font-medium">Repeat every</label>
          <input id="intervalCount" name="intervalCount" type="number" min={1} max={52} defaultValue={v.intervalCount || "1"} readOnly={editing} className={inputClass} required {...a("intervalCount")} />
          {e("intervalCount")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="frequency" className="block text-sm font-medium">Unit</label>
          {editing ? <input type="hidden" name="frequency" value={v.frequency} /> : null}
          <select id="frequency" name={editing ? undefined : "frequency"} defaultValue={v.frequency || "monthly"} disabled={editing} className={inputClass} {...a("frequency")}>
            <option value="weekly">Week(s)</option>
            <option value="monthly">Month(s)</option>
            <option value="yearly">Year(s)</option>
          </select>
          {e("frequency")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="startDate" className="block text-sm font-medium">First date</label>
          <input id="startDate" name="startDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={v.startDate} readOnly={editing} className={inputClass} required {...a("startDate")} />
          {e("startDate")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endDate" className="block text-sm font-medium">Last date <span className="font-normal text-muted">(optional)</span></label>
          <input id="endDate" name="endDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={v.endDate} className={inputClass} {...a("endDate")} />
          {e("endDate")}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
        <Link href="/recurring" className={secondaryButtonClass}>Cancel</Link>
      </div>
    </form>
  );
}
