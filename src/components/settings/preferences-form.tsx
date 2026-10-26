"use client";
import { useActionState } from "react";
import { buttonClass, FormMessage, inputClass } from "@/components/ui/field";
import { savePreferencesAction } from "@/app/(app)/settings/actions";

export function PreferencesForm({ initial, timezones }: { initial: { name: string; timezone: string; theme: string }; timezones: string[] }) {
  const [state, action, pending] = useActionState(savePreferencesAction, null);
  const v = state?.values ?? initial;
  const err = state?.fields ?? {};
  const a = (n: string) => ({ "aria-invalid": err[n] ? true : undefined, "aria-describedby": err[n] ? `${n}-error` : undefined });
  // The key remounts the form after a successful save so every field, selects included, shows what was saved.
  return (
    <form key={state?.ok ? JSON.stringify(state.values) : "editing"} action={action} className="space-y-4" noValidate>
      {state?.message ? <FormMessage kind={state.ok ? "info" : "error"}>{state.message}</FormMessage> : null}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" name="name" maxLength={80} defaultValue={v.name} autoComplete="name" className={inputClass} required {...a("name")} />
        {err.name ? <p id="name-error" className="text-sm text-expense">{err.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="timezone" className="block text-sm font-medium">Timezone</label>
        <select id="timezone" name="timezone" defaultValue={v.timezone} className={inputClass} {...a("timezone")}>
          {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <p className="text-sm text-muted">Decides what “today” and “this month” mean in your reports. Transaction dates are plain calendar days and do not shift.</p>
        {err.timezone ? <p id="timezone-error" className="text-sm text-expense">{err.timezone}</p> : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="theme" className="block text-sm font-medium">Theme</label>
        <select id="theme" name="theme" defaultValue={v.theme} className={inputClass} {...a("theme")}>
          <option value="system">Match my device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        {err.theme ? <p id="theme-error" className="text-sm text-expense">{err.theme}</p> : null}
      </div>
      <p className="text-sm text-muted">Currency: NGN (the only supported currency for now).</p>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
