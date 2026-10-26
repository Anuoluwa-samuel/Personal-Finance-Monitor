"use client";
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui/field";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/server/domain/category-style";
import type { FormState } from "@/server/form";

export function CategoryForm({
  action,
  initial,
  showType,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: { type: string; name: string; icon: string; color: string };
  showType: boolean;
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
      {showType ? (
        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-sm font-medium">Type</label>
          <select id="type" name="type" defaultValue={v.type || "expense"} className={inputClass} {...a("type")}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          {e("type")}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" name="name" maxLength={40} defaultValue={v.name} className={inputClass} required {...a("name")} />
        {e("name")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="icon" className="block text-sm font-medium">Icon <span className="font-normal text-muted">(optional)</span></label>
          <select id="icon" name="icon" defaultValue={v.icon} className={inputClass} {...a("icon")}>
            <option value="">None</option>
            {CATEGORY_ICONS.map((i) => <option key={i} value={i}>{i.replace("-", " ")}</option>)}
          </select>
          {e("icon")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="color" className="block text-sm font-medium">Colour <span className="font-normal text-muted">(optional)</span></label>
          <select id="color" name="color" defaultValue={v.color} className={inputClass} {...a("color")}>
            <option value="">None</option>
            {CATEGORY_COLORS.map((c) => <option key={c.hex} value={c.hex}>{c.name}</option>)}
          </select>
          {e("color")}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
        {cancelHref ? <Link href={cancelHref} className={secondaryButtonClass}>Cancel</Link> : null}
      </div>
    </form>
  );
}
