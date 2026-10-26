"use server";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { archiveBudget, createBudget, updateBudget } from "@/server/budgets";
import { failure, text, type FormState } from "@/server/form";
import { userOrLogin } from "@/server/action-user";

function read(fd: FormData) {
  const cats = fd.getAll("lineCategory").map(String);
  const limits = fd.getAll("lineLimit").map(String);
  return {
    month: text(fd, "month"),
    overallLimit: text(fd, "overallLimit"),
    lines: cats.map((categoryId, i) => ({ categoryId, limit: limits[i] ?? "" })),
  };
}

const flat = (v: ReturnType<typeof read>) => ({ month: v.month, overallLimit: v.overallLimit });

export async function createBudgetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = read(fd);
  let id: string;
  try {
    id = await createBudget(userId, { month: v.month, overallLimit: v.overallLimit || null, lines: v.lines });
  } catch (e) {
    return failure(e, flat(v));
  }
  redirect(`/budgets/${id}`);
}

export async function updateBudgetAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = read(fd);
  try {
    await updateBudget(userId, id, { overallLimit: v.overallLimit || null, lines: v.lines });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/budgets");
    return failure(e, flat(v));
  }
  redirect(`/budgets/${id}`);
}

export async function archiveBudgetAction(id: string): Promise<void> {
  const userId = await userOrLogin();
  try {
    await archiveBudget(userId, id);
  } catch (e) {
    if (!(e instanceof AppError && e.code === "NOT_FOUND")) throw e;
  }
  redirect("/budgets");
}
