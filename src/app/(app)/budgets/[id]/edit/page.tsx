import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetForm } from "@/components/budgets/budget-form";
import { AppError } from "@/lib/errors";
import { getBudget } from "@/server/budgets";
import { requireUserId } from "@/server/session";
import { listUsableCategories } from "@/server/transactions";
import { updateBudgetAction } from "../../actions";

export const metadata = { title: "Edit budget · Ispentit" };

export default async function EditBudgetPage({ params }: PageProps<"/budgets/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const b = await getBudget(userId, id).catch((e) => {
    if (e instanceof AppError || e?.name === "ZodError") notFound();
    throw e;
  });
  if (b.archived) notFound();
  const usable = (await listUsableCategories(userId)).filter((c) => c.type === "expense");
  // Categories archived after a line was added stay selectable so the line can be kept.
  const extra = b.lines.filter((l) => !usable.some((c) => c.id === l.categoryId)).map((l) => ({ id: l.categoryId, name: `${l.categoryName} (archived)` }));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/budgets/${b.id}`} className="text-sm underline">← Back to budget</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit budget</h1>
      <BudgetForm
        action={updateBudgetAction.bind(null, b.id)}
        categories={[...usable, ...extra]}
        initial={{ month: b.month.slice(0, 7), overallLimit: b.overall?.limit ?? "", lines: b.lines.map((l) => ({ categoryId: l.categoryId, limit: l.limit })) }}
        monthEditable={false}
        submitLabel="Save changes"
        cancelHref={`/budgets/${b.id}`}
      />
    </div>
  );
}
