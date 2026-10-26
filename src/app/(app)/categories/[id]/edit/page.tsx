import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/categories/category-form";
import { listCategories } from "@/server/categories";
import { requireUserId } from "@/server/session";
import { updateCategoryAction } from "../../actions";

export const metadata = { title: "Edit category · Ispentit" };

export default async function EditCategoryPage({ params }: PageProps<"/categories/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const c = (await listCategories(userId)).find((x) => x.id === id);
  if (!c || c.isSystem) notFound();
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/categories" className="text-sm underline">← Categories</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit category</h1>
      <p className="text-muted">The type ({c.type}) cannot be changed, because that would change the meaning of past transactions.</p>
      <CategoryForm
        action={updateCategoryAction.bind(null, c.id)}
        initial={{ type: c.type, name: c.name, icon: c.icon ?? "", color: c.color ?? "" }}
        showType={false}
        submitLabel="Save changes"
        cancelHref="/categories"
      />
    </div>
  );
}
