import Link from "next/link";
import { RuleForm } from "@/components/recurring/rule-form";
import { listUsableAccounts } from "@/server/accounts";
import { todayIn } from "@/server/domain/periods";
import { getPreferences } from "@/server/preferences";
import { requireUserId } from "@/server/session";
import { listUsableCategories } from "@/server/transactions";
import { createRuleAction } from "../actions";

export const metadata = { title: "New recurring rule · Ispentit" };

export default async function NewRulePage() {
  const userId = await requireUserId();
  const [categories, accounts, prefs] = await Promise.all([listUsableCategories(userId), listUsableAccounts(userId), getPreferences(userId)]);
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/recurring" className="text-sm underline">← Recurring</Link>
      <h1 className="text-2xl font-semibold tracking-tight">New recurring rule</h1>
      <RuleForm action={createRuleAction} categories={categories} accounts={accounts} editing={false} submitLabel="Create rule"
        initial={{ kind: "expense", amount: "", description: "", categoryId: "", accountId: "", frequency: "monthly", intervalCount: "1", startDate: todayIn(prefs.timezone, new Date()), endDate: "" }} />
    </div>
  );
}
