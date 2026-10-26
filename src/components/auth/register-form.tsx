"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage } from "@/components/ui/field";

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/dashboard",
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : error.code === "PASSWORD_TOO_SHORT"
            ? "Use a password of at least 10 characters."
            : "We could not create that account. Check your details and try again.",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    // Same message whether or not the address was already registered.
    return (
      <FormMessage kind="info">
        Check your email. If the address can be used, we sent a link to verify it. Verify, then sign in.
      </FormMessage>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <Field label="Name" id="name" autoComplete="name" required maxLength={80} />
      <Field label="Email" id="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        id="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters."
      />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-muted">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline">Terms of Service</Link> and the{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}
