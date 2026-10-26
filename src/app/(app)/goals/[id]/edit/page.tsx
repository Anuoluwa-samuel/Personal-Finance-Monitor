import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalForm } from "@/components/goals/goal-form";
import { AppError } from "@/lib/errors";
import { getGoal } from "@/server/savings";
import { requireUserId } from "@/server/session";
import { updateGoalAction } from "../../actions";

export const metadata = { title: "Edit savings goal · Ispentit" };

export default async function EditGoalPage({ params }: PageProps<"/goals/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const g = await getGoal(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  if (g.status !== "active") notFound();
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href={`/goals/${g.id}`} className="text-sm underline">← Back to goal</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit savings goal</h1>
      <GoalForm
        action={updateGoalAction.bind(null, g.id)}
        initial={{ name: g.name, target: g.target, startingAmount: g.startingAmount === "0.00" ? "" : g.startingAmount, targetDate: g.targetDate ?? "" }}
        submitLabel="Save changes"
        cancelHref={`/goals/${g.id}`}
      />
    </div>
  );
}
