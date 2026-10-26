"use client";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass } from "@/components/ui/field";
import type { FormState } from "@/server/form";

export function ContributionForm({
  action,
  defaultDate,
  idempotencyKey,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaultDate: string;
  idempotencyKey: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? { amount: "", contributedOn: defaultDate, note: "" };
  const err = state?.fields ?? {};
  const a = (n: string) => ({ "aria-invalid": err[n] ? true : undefined, "aria-describedby": err[n] ? `${n}-error` : undefined });
  const e = (n: string) => (err[n] ? <p id={`${n}-error`} className="text-sm text-expense">{err[n]}</p> : null);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="amount" className="block text-sm font-medium">Amount (NGN)</label>
          <input id="amount" name="amount" inputMode="decimal" autoComplete="off" defaultValue={v.amount} placeholder="5000.00" className={inputClass} required {...a("amount")} />
          {e("amount")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contributedOn" className="block text-sm font-medium">Date</label>
          <input id="contributedOn" name="contributedOn" type="date" min="2000-01-01" max="2100-12-31" defaultValue={v.contributedOn} className={inputClass} required {...a("contributedOn")} />
          {e("contributedOn")}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium">Note <span className="font-normal text-muted">(optional)</span></label>
        <input id="note" name="note" maxLength={200} defaultValue={v.note} className={inputClass} {...a("note")} />
        {e("note")}
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Recording…" : "Record contribution"}</button>
    </form>
  );
}
