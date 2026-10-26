"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage } from "@/components/ui/field";

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.resetPassword({ newPassword: String(form.get("password")), token });
    setPending(false);
    if (error) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <FormMessage kind="info">
        Password updated and other sessions signed out.{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </FormMessage>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <Field
        label="New password"
        id="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters."
      />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
