"use server";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { failure, text, type FormState } from "@/server/form";
import {
  addContribution,
  archiveGoal,
  completeGoal,
  createGoal,
  deleteContribution,
  deleteGoal,
  reopenGoal,
  restoreGoal,
  updateGoal,
} from "@/server/savings";
import { userOrLogin } from "@/server/action-user";

const readGoal = (fd: FormData) => ({
  name: text(fd, "name"),
  target: text(fd, "target"),
  startingAmount: text(fd, "startingAmount"),
  targetDate: text(fd, "targetDate"),
});

export async function createGoalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = readGoal(fd);
  let id: string;
  try {
    id = await createGoal(userId, { ...v, targetDate: v.targetDate || null });
  } catch (e) {
    return failure(e, v);
  }
  redirect(`/goals/${id}`);
}

export async function updateGoalAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = readGoal(fd);
  try {
    await updateGoal(userId, id, { ...v, targetDate: v.targetDate || null });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/goals");
    return failure(e, v);
  }
  redirect(`/goals/${id}`);
}

export async function addContributionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { amount: text(fd, "amount"), contributedOn: text(fd, "contributedOn"), note: text(fd, "note") };
  try {
    await addContribution(userId, id, { ...v, note: v.note || null, idempotencyKey: text(fd, "idempotencyKey") || undefined });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/goals");
    return failure(e, v);
  }
  redirect(`/goals/${id}`);
}

/** Runs a status change; NOT_FOUND / CONFLICT just return to the goal page, which shows the current state. */
async function run(id: string, fn: (userId: string, id: string) => Promise<void>, to: string): Promise<never> {
  const userId = await userOrLogin();
  try {
    await fn(userId, id);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    if (e.code === "NOT_FOUND") redirect("/goals");
  }
  redirect(to);
}

export async function completeGoalAction(id: string): Promise<void> { await run(id, completeGoal, `/goals/${id}`); }
export async function reopenGoalAction(id: string): Promise<void> { await run(id, reopenGoal, `/goals/${id}`); }
export async function archiveGoalAction(id: string): Promise<void> { await run(id, archiveGoal, "/goals"); }
export async function restoreGoalAction(id: string): Promise<void> { await run(id, restoreGoal, `/goals/${id}`); }
export async function deleteGoalAction(id: string): Promise<void> { await run(id, deleteGoal, "/goals"); }

export async function deleteContributionAction(goalId: string, contributionId: string): Promise<void> {
  await run(contributionId, deleteContribution, `/goals/${goalId}`);
}
