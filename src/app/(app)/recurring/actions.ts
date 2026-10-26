"use server";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { failure, text, type FormState } from "@/server/form";
import { createRule, deleteRule, pauseRule, postOccurrence, resumeRule, skipOccurrence, updateRule } from "@/server/recurring";
import { userOrLogin } from "@/server/action-user";

export async function createRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = {
    kind: text(fd, "kind"), amount: text(fd, "amount"), description: text(fd, "description"), categoryId: text(fd, "categoryId"),
    accountId: text(fd, "accountId"), frequency: text(fd, "frequency"), intervalCount: text(fd, "intervalCount"),
    startDate: text(fd, "startDate"), endDate: text(fd, "endDate"),
  };
  try {
    await createRule(userId, {
      ...v,
      kind: v.kind as "income" | "expense",
      frequency: v.frequency as "weekly",
      accountId: v.accountId || null,
      intervalCount: Number(v.intervalCount),
      endDate: v.endDate || null,
    });
  } catch (e) {
    return failure(e, v);
  }
  redirect("/recurring");
}

export async function updateRuleAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { amount: text(fd, "amount"), description: text(fd, "description"), categoryId: text(fd, "categoryId"), accountId: text(fd, "accountId"), endDate: text(fd, "endDate") };
  try {
    await updateRule(userId, id, { ...v, accountId: v.accountId || null, endDate: v.endDate || null });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/recurring");
    return failure(e, v);
  }
  redirect("/recurring");
}

async function run(fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof AppError)) throw e; // NOT_FOUND / CONFLICT: just show the current state
  }
  redirect("/recurring");
}

export async function pauseRuleAction(id: string): Promise<void> { const u = await userOrLogin(); await run(() => pauseRule(u, id)); }
export async function resumeRuleAction(id: string): Promise<void> { const u = await userOrLogin(); await run(() => resumeRule(u, id)); }
export async function deleteRuleAction(id: string): Promise<void> { const u = await userOrLogin(); await run(() => deleteRule(u, id)); }
export async function skipOccurrenceAction(id: string): Promise<void> { const u = await userOrLogin(); await run(() => skipOccurrence(u, id)); }

export async function confirmOccurrenceAction(id: string, fd: FormData): Promise<void> {
  const u = await userOrLogin();
  await run(() => postOccurrence(u, id, { amount: text(fd, "amount") || null, transactionDate: text(fd, "transactionDate") || null }));
}
