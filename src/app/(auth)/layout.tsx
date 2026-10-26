import Link from "next/link";
import { redirect } from "next/navigation";
import { LegalFooter } from "@/components/legal/legal-footer";
import { getSessionUser } from "@/server/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <>
      <main id="main" className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight">
          Ispentit
        </Link>
        {children}
      </main>
      <LegalFooter />
    </>
  );
}
