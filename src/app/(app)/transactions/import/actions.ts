"use server";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { LIMITS } from "@/server/rate-limit";
import { IMPORT_MAX_BYTES, confirmImport, discardImport, previewImport, type ImportPreview } from "@/server/import";
import { userOrLogin } from "@/server/action-user";

export type ImportState = { preview?: ImportPreview; error?: string; fileName?: string } | null;

export async function previewImportAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  let userId: string;
  try {
    userId = await userOrLogin({ name: "import", ...LIMITS.importPreview });
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") return { error: e.message };
    throw e;
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  if (file.size > IMPORT_MAX_BYTES) return { error: `That file is too large (limit ${IMPORT_MAX_BYTES / 1024} KB). Split it into smaller files.` };
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) return { error: "Only .csv files can be imported." };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { error: "The file is not valid UTF-8 text. Save it as CSV (UTF-8) and try again." };
  }
  return { preview: await previewImport(userId, file.name, text), fileName: file.name };
}

export async function confirmImportAction(batchId: string): Promise<void> {
  const userId = await userOrLogin();
  let inserted: number;
  try {
    ({ inserted } = await confirmImport(userId, batchId));
  } catch (e) {
    // Only a fixed code travels in the URL; the page maps it to fixed text, so a crafted link cannot show arbitrary words.
    if (e instanceof AppError) redirect(`/transactions/import?problem=${e.code === "CONFLICT" ? "expired" : e.code === "NOT_FOUND" ? "missing" : "failed"}`);
    throw e;
  }
  redirect(`/transactions?imported=${inserted}`);
}

export async function discardImportAction(batchId: string): Promise<void> {
  const userId = await userOrLogin();
  await discardImport(userId, batchId).catch(() => undefined);
  redirect("/transactions/import");
}
