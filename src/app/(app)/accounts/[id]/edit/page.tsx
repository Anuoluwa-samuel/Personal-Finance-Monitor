import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/accounts/account-form";
import { listAccounts } from "@/server/accounts";
import { requireUserId } from "@/server/session";
import { updateAccountAction } from "../../actions";

export const metadata = { title: "Edit account · Ispentit" };

export default async function EditAccountPage({ params }: PageProps<"/accounts/[id]/edit">) {
  const { id } = await params;
  const userId = await requireUserId();
  const a = (await listAccounts(userId)).find((x) => x.id === id);
  if (!a || a.archived) notFound();
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/accounts" className="text-sm underline">← Accounts</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit account</h1>
      <AccountForm action={updateAccountAction.bind(null, a.id)} initial={{ name: a.name, openingBalance: a.openingBalance === "0.00" ? "" : a.openingBalance }} submitLabel="Save changes" cancelHref="/accounts" />
    </div>
  );
}
