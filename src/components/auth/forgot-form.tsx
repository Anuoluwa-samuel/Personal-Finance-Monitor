"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage } from "@/components/ui/field";

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    await authClient.requestPasswordReset({ email: String(form.get("email")), redirectTo: "/reset-password" });
    setPending(false);
    setDone(true); // identical outcome whether or not the account exists
  }

  if (done) {
    return <FormMessage kind="info">If an account exists for that email, we sent a reset link. It expires in one hour.</FormMessage>;
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" id="email" type="email" autoComplete="email" required />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
