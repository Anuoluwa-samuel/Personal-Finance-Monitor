"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { failure, text, type FormState } from "@/server/form";
import { THEMES, updatePreferences, type Theme } from "@/server/preferences";
import { userOrLogin } from "@/server/action-user";

async function writeThemeCookie(theme: Theme) {
  (await cookies()).set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}

export async function setThemeAction(theme: string): Promise<void> {
  const userId = await userOrLogin();
  if (!(THEMES as readonly string[]).includes(theme)) return;
  await updatePreferences(userId, { theme: theme as Theme });
  await writeThemeCookie(theme as Theme);
}

export async function savePreferencesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await userOrLogin();
  const v = { name: text(fd, "name").trim(), timezone: text(fd, "timezone"), theme: text(fd, "theme") };
  try {
    if (v.name.length < 1 || v.name.length > 80) {
      throw new AppError("VALIDATION", "Check the highlighted fields", { name: "Enter a name of up to 80 characters" });
    }
    await updatePreferences(userId, { timezone: v.timezone, theme: v.theme as Theme });
    await auth.api.updateUser({ headers: await headers(), body: { name: v.name } });
    await writeThemeCookie(v.theme as Theme);
  } catch (e) {
    return failure(e, v);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Your settings were saved.", values: v };
}
