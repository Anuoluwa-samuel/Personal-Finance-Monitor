import Link from "next/link";
import { CategoryForm } from "@/components/categories/category-form";
import { CategoryIcon } from "@/components/categories/category-icon";
import { secondaryButtonClass } from "@/components/ui/field";
import { listCategories, type CategoryDTO } from "@/server/categories";
import { requireUserId } from "@/server/session";
import { createCategoryAction, setArchivedAction } from "./actions";

export const metadata = { title: "Categories · Ispentit" };

function Row({ c }: { c: CategoryDTO }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <CategoryIcon name={c.icon} color={c.color} />
        <span className={`font-medium ${c.archived ? "text-muted" : ""}`}>{c.name}</span>
        {c.isSystem ? <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">Default</span> : null}
        {c.archived ? <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">Archived</span> : null}
        <span className="text-sm text-muted">{c.usage} {c.usage === 1 ? "transaction" : "transactions"}</span>
      </div>
      {!c.isSystem ? (
        <div className="flex items-center gap-2">
          {!c.archived ? (
            <Link href={`/categories/${c.id}/edit`} className={secondaryButtonClass}>
              Edit<span className="sr-only"> {c.name}</span>
            </Link>
          ) : null}
          <form action={setArchivedAction.bind(null, c.id, !c.archived)}>
            <button type="submit" className={secondaryButtonClass}>
              {c.archived ? "Restore" : "Archive"}<span className="sr-only"> {c.name}</span>
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export default async function CategoriesPage() {
  const userId = await requireUserId();
  const all = await listCategories(userId);
  const groups = [
    { title: "Expense categories", items: all.filter((c) => c.type === "expense") },
    { title: "Income categories", items: all.filter((c) => c.type === "income") },
  ];
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="max-w-prose text-muted">
          Default categories are shared and cannot be changed. Your own categories can be renamed or archived.
          Archiving hides a category from new entries but keeps it on past transactions and in your reports.
        </p>
      </header>

      <section aria-labelledby="add" className="max-w-lg space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="add" className="text-lg font-semibold">Add a category</h2>
        <CategoryForm action={createCategoryAction} initial={{ type: "expense", name: "", icon: "", color: "" }} showType submitLabel="Add category" />
      </section>

      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold">{g.title}</h2>
          <ul>{g.items.map((c) => <Row key={c.id} c={c} />)}</ul>
        </section>
      ))}
    </div>
  );
}
