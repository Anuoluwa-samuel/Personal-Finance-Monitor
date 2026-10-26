"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage } from "@/components/ui/field";

export function PasswordForm() {
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setMsg(null);
    setPending(true);
    const fd = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(fd.get("currentPassword")),
      newPassword: String(fd.get("newPassword")),
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setMsg({ kind: "error", text: error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Your current password is wrong, or the new one is not allowed (at least 10 characters)." });
      return;
    }
    form.reset();
    setMsg({ kind: "info", text: "Password changed. You were signed out of your other devices." });
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {msg ? <FormMessage kind={msg.kind}>{msg.text}</FormMessage> : null}
      <Field label="Current password" id="currentPassword" type="password" autoComplete="current-password" required />
      <Field label="New password" id="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} hint="At least 10 characters." />
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Changing…" : "Change password"}</button>
    </form>
  );
}
