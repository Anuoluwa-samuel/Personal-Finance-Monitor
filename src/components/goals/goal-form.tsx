"use client";
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import type { FormState } from "@/server/form";

export function GoalForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: { name: string; target: string; startingAmount: string; targetDate: string };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? initial;
  const err = state?.fields ?? {};
  const a = (n: string) => ({ "aria-invalid": err[n] ? true : undefined, "aria-describedby": err[n] ? `${n}-error` : undefined });
  const e = (n: string) => (err[n] ? <p id={`${n}-error`} className="text-sm text-expense">{err[n]}</p> : null);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">Goal name</label>
        <input id="name" name="name" maxLength={80} defaultValue={v.name} placeholder="Laptop" className={inputClass} required {...a("name")} />
        {e("name")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="target" className="block text-sm font-medium">Target amount (NGN)</label>
        <input id="target" name="target" inputMode="decimal" autoComplete="off" defaultValue={v.target} placeholder="450000.00" className={inputClass} required {...a("target")} />
        {e("target")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="startingAmount" className="block text-sm font-medium">Already saved <span className="font-normal text-muted">(optional)</span></label>
        <input id="startingAmount" name="startingAmount" inputMode="decimal" autoComplete="off" defaultValue={v.startingAmount} placeholder="0.00" className={inputClass} {...a("startingAmount")} />
        {e("startingAmount")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="targetDate" className="block text-sm font-medium">Target date <span className="font-normal text-muted">(optional)</span></label>
        <input id="targetDate" name="targetDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={v.targetDate} className={inputClass} {...a("targetDate")} />
        {e("targetDate")}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className={secondaryButtonClass}>Cancel</Link>
      </div>
    </form>
  );
}
