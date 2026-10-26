"use server";
import { redirect } from "next/navigation";
import { failure, text, type FormState } from "@/server/form";
import { userOrLogin } from "@/server/action-user";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/transactions";
import { AppError } from "@/lib/errors";

function read(fd: FormData) {
  return {
    kind: text(fd, "kind"),
    amount: text(fd, "amount"),
    description: text(fd, "description"),
    categoryId: text(fd, "categoryId"),
    accountId: text(fd, "accountId"),
    transactionDate: text(fd, "transactionDate"),
    notes: text(fd, "notes"),
  };
}

export async function createTransactionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = read(fd);
  try {
    await createTransaction(userId, { ...v, accountId: v.accountId || null, kind: v.kind as "income" | "expense", idempotencyKey: text(fd, "idempotencyKey") || undefined });
  } catch (e) {
    return failure(e, v);
  }
  redirect("/transactions");
}

export async function updateTransactionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = read(fd);
  try {
    await updateTransaction(userId, id, { ...v, accountId: v.accountId || null, kind: v.kind as "income" | "expense", notes: v.notes || null });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/transactions");
    return failure(e, v);
  }
  redirect(`/transactions/${id}`);
}

export async function deleteTransactionAction(id: string): Promise<void> {
  const userId = await userOrLogin();
  try {
    await deleteTransaction(userId, id);
  } catch (e) {
    if (!(e instanceof AppError && e.code === "NOT_FOUND")) throw e;
  }
  redirect("/transactions");
}
