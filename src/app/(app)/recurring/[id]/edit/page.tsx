import Link from "next/link";
import { notFound } from "next/navigation";
import { RuleForm } from "@/components/recurring/rule-form";
import { listUsableAccounts } from "@/server/accounts";
import { listRules } from "@/server/recurring";
import { requireUserId } from "@/server/session";
import { listUsableCategories } from "@/server/transactions";
import { updateRuleAction } from "../../actions";

export const metadata = { title: "Edit recurring rule · Ispentit" };

export default async function EditRulePage({ params }: PageProps<"/recurring/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const r = (await listRules(userId)).find((x) => x.id === id);
  if (!r) notFound();
  const [usable, usableAccounts] = await Promise.all([listUsableCategories(userId), listUsableAccounts(userId)]);
  const categories = usable.some((c) => c.id === r.categoryId) ? usable : [...usable, { id: r.categoryId, name: `${r.categoryName} (archived)`, type: r.kind, isSystem: false }];
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/recurring" className="text-sm underline">← Recurring</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit recurring rule</h1>
      <RuleForm action={updateRuleAction.bind(null, r.id)} categories={categories} accounts={usableAccounts} editing submitLabel="Save changes"
        initial={{ kind: r.kind, amount: r.amount, description: r.description, categoryId: r.categoryId, accountId: r.accountId ?? "", frequency: r.frequency, intervalCount: String(r.intervalCount), startDate: r.startDate, endDate: r.endDate ?? "" }} />
    </div>
  );
}
