"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setThemeAction } from "@/app/(app)/settings/actions";

export function ThemeSelect({ value }: { value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only sm:not-sr-only text-muted">Theme</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => start(async () => { await setThemeAction(e.target.value); router.refresh(); })}
        className="min-h-11 rounded-md border border-border bg-surface px-2 text-sm"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
