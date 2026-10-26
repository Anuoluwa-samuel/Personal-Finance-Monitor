"use client";
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import type { FormState } from "@/server/form";

export function AccountForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: { name: string; openingBalance: string };
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? initial;
  const err = state?.fields ?? {};
  const a = (n: string) => ({ "aria-invalid": err[n] ? true : undefined, "aria-describedby": err[n] ? `${n}-error` : undefined });
  const e = (n: string) => (err[n] ? <p id={`${n}-error`} className="text-sm text-expense">{err[n]}</p> : null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" name="name" maxLength={60} defaultValue={v.name} placeholder="Cash, GTBank, Opay…" className={inputClass} required {...a("name")} />
        {e("name")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="openingBalance" className="block text-sm font-medium">Opening balance (NGN) <span className="font-normal text-muted">(optional)</span></label>
        <input id="openingBalance" name="openingBalance" inputMode="decimal" autoComplete="off" defaultValue={v.openingBalance} placeholder="0.00" className={inputClass} {...a("openingBalance")} />
        <p className="text-sm text-muted">What was in it before your first recorded transaction.</p>
        {e("openingBalance")}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
        {cancelHref ? <Link href={cancelHref} className={secondaryButtonClass}>Cancel</Link> : null}
      </div>
    </form>
  );
}
