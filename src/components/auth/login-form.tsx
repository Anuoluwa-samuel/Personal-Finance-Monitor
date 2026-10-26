"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage } from "@/components/ui/field";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(
        error.code === "EMAIL_NOT_VERIFIED"
          ? "Please verify your email first. Check your inbox for the link we sent."
          : error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Incorrect email or password.",
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <Field label="Email" id="email" type="email" autoComplete="email" required />
      <Field label="Password" id="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
