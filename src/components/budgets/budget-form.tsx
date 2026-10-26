"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import type { FormState } from "@/server/form";

type Line = { key: number; categoryId: string; limit: string };

export function BudgetForm({
  action,
  categories,
  initial,
  monthEditable,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  categories: { id: string; name: string }[];
  initial: { month: string; overallLimit: string; lines: { categoryId: string; limit: string }[] };
  monthEditable: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = state?.fields ?? {};
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l, i) => ({ key: i, ...l })));
  // A ref, not state: two clicks in one tick must still get distinct keys.
  const nextKey = useRef(initial.lines.length);
  const chosen = new Set(lines.map((l) => l.categoryId));
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state?.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}

      <div className="space-y-1.5">
        <label htmlFor="month" className="block text-sm font-medium">Month</label>
        <input id="month" name="month" type="month" min="2000-01" max="2100-12" defaultValue={state?.values?.month ?? initial.month} readOnly={!monthEditable} required className={`${inputClass} ${monthEditable ? "" : "opacity-70"}`} aria-invalid={err.month ? true : undefined} aria-describedby={err.month ? "month-error" : undefined} />
        {!monthEditable ? <p className="text-sm text-muted">The month cannot be changed. Archive this budget and create a new one instead.</p> : null}
        {err.month ? <p id="month-error" className="text-sm text-expense">{err.month}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="overallLimit" className="block text-sm font-medium">
          Overall spending limit (NGN) <span className="font-normal text-muted">(optional if you set category limits)</span>
        </label>
        <input id="overallLimit" name="overallLimit" inputMode="decimal" autoComplete="off" defaultValue={state?.values?.overallLimit ?? initial.overallLimit} placeholder="150000.00" className={inputClass} aria-invalid={err.overallLimit ? true : undefined} aria-describedby={err.overallLimit ? "overallLimit-error" : "overallLimit-hint"} />
        <p id="overallLimit-hint" className="text-sm text-muted">Counts every expense in the month, including categories without their own limit.</p>
        {err.overallLimit ? <p id="overallLimit-error" className="text-sm text-expense">{err.overallLimit}</p> : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Category limits</legend>
        {err.lines ? <p className="text-sm text-expense">{err.lines}</p> : null}
        {lines.length === 0 ? <p className="text-sm text-muted">No category limits yet.</p> : null}
        {lines.map((l, i) => (
          <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div className="space-y-1">
              <label htmlFor={`cat-${l.key}`} className="block text-sm">Category {i + 1}</label>
              <select id={`cat-${l.key}`} name="lineCategory" value={l.categoryId} onChange={(e) => set(l.key, { categoryId: e.target.value })} className={inputClass} required aria-invalid={err[`lines.${i}.categoryId`] ? true : undefined}>
                <option value="">Choose a category</option>
                {categories.filter((c) => c.id === l.categoryId || !chosen.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {err[`lines.${i}.categoryId`] ? <p className="text-sm text-expense">{err[`lines.${i}.categoryId`]}</p> : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`lim-${l.key}`} className="block text-sm">Limit (NGN)</label>
              <input id={`lim-${l.key}`} name="lineLimit" inputMode="decimal" autoComplete="off" value={l.limit} onChange={(e) => set(l.key, { limit: e.target.value })} className={inputClass} required aria-invalid={err[`lines.${i}.limit`] ? true : undefined} />
              {err[`lines.${i}.limit`] ? <p className="text-sm text-expense">{err[`lines.${i}.limit`]}</p> : null}
            </div>
            <button type="button" className={secondaryButtonClass} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
              Remove<span className="sr-only"> category limit {i + 1}</span>
            </button>
          </div>
        ))}
        {lines.length < 30 ? (
          <button type="button" className={secondaryButtonClass} onClick={() => { const key = nextKey.current++; setLines((ls) => [...ls, { key, categoryId: "", limit: "" }]); }}>
            Add category limit
          </button>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className={secondaryButtonClass}>Cancel</Link>
      </div>
    </form>
  );
}
