"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { createCategory, setCategoryArchived, updateCategory } from "@/server/categories";
import { failure, text, type FormState } from "@/server/form";
import { userOrLogin } from "@/server/action-user";

const read = (fd: FormData) => ({ name: text(fd, "name"), icon: text(fd, "icon"), color: text(fd, "color") });

export async function createCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { ...read(fd), type: text(fd, "type") };
  try {
    await createCategory(userId, { type: v.type as "income" | "expense", name: v.name, icon: (v.icon || null) as never, color: v.color || null });
  } catch (e) {
    return failure(e, v);
  }
  revalidatePath("/categories");
  redirect("/categories");
}

export async function updateCategoryAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = read(fd);
  try {
    await updateCategory(userId, id, { name: v.name, icon: (v.icon || null) as never, color: v.color || null });
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) redirect("/categories");
    return failure(e, { ...v, type: "" });
  }
  redirect("/categories");
}

export async function setArchivedAction(id: string, archived: boolean): Promise<void> {
  const userId = await userOrLogin();
  try {
    await setCategoryArchived(userId, id, archived);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
  }
  revalidatePath("/categories");
}
