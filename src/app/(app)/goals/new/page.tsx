import Link from "next/link";
import { GoalForm } from "@/components/goals/goal-form";
import { createGoalAction } from "../actions";

export const metadata = { title: "New savings goal · Ispentit" };

export default function NewGoalPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/goals" className="text-sm underline">← Savings goals</Link>
      <h1 className="text-2xl font-semibold tracking-tight">New savings goal</h1>
      <GoalForm action={createGoalAction} initial={{ name: "", target: "", startingAmount: "", targetDate: "" }} submitLabel="Create goal" cancelHref="/goals" />
    </div>
  );
}
