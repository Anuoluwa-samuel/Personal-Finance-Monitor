"use client";
import { useId, useRef } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui/field";

/** Native <dialog>: focus is trapped, Escape closes it, and it is announced as a modal dialog. */
export function DeleteButton({
  action,
  title,
  body,
  triggerLabel = "Delete",
  confirmLabel = "Yes, delete",
  cancelLabel = "Keep it",
}: {
  action: () => Promise<void>;
  title: string;
  body: string;
  triggerLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={`${secondaryButtonClass} text-expense`} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-5 text-foreground backdrop:bg-black/50">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-muted">{body}</p>
        <form action={action} className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => ref.current?.close()} autoFocus>
            {cancelLabel}
          </button>
          <button type="submit" className={`${buttonClass} !bg-expense`}>
            {confirmLabel}
          </button>
        </form>
      </dialog>
    </>
  );
}
