"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAccount, setAccountArchived, updateAccount } from "@/server/accounts";
import { AppError } from "@/lib/errors";
import { failure, text, type FormState } from "@/server/form";
import { userOrLogin } from "@/server/action-user";

export async function createAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { name: text(fd, "name"), openingBalance: text(fd, "openingBalance") };
  try {
    await createAccount(userId, v);
  } catch (e) {
    return failure(e, v);
  }
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function updateAccountAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { name: text(fd, "name"), openingBalance: text(fd, "openingBalance") };
  try {
    await updateAccount(userId, id, v);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") redirect("/accounts");
    return failure(e, v);
  }
  redirect("/accounts");
}

export async function setAccountArchivedAction(id: string, archived: boolean): Promise<void> {
  const userId = await userOrLogin();
  try {
    await setAccountArchived(userId, id, archived);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
  }
  revalidatePath("/accounts");
}
