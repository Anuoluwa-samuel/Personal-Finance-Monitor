"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass, Field, FormMessage, secondaryButtonClass } from "@/components/ui/field";

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await authClient.deleteUser({ password: String(fd.get("password")) });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That password is not correct, so nothing was deleted.");
      return;
    }
    router.push("/?deleted=1");
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`${secondaryButtonClass} text-expense`} onClick={() => dialog.current?.showModal()}>
        Delete my account…
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-5 text-foreground backdrop:bg-black/50">
        <h2 id={titleId} className="text-lg font-semibold">Delete your account?</h2>
        <p className="mt-2 text-muted">
          This permanently deletes <strong className="text-foreground">{email}</strong> and everything recorded under it: transactions, budgets, goals, accounts,
          categories and recurring rules. It cannot be undone. Export your transactions first if you want a copy.
        </p>
        <form method="post" onSubmit={onSubmit} className="mt-4 space-y-4">
          {error ? <FormMessage kind="error">{error}</FormMessage> : null}
          <Field label="Enter your password to confirm" id="password" type="password" autoComplete="current-password" required />
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={secondaryButtonClass} onClick={() => dialog.current?.close()}>Keep my account</button>
            <button type="submit" disabled={pending} className={`${buttonClass} !bg-expense`}>{pending ? "Deleting…" : "Delete everything"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
