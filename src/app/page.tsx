import Link from "next/link";
import { LegalFooter } from "@/components/legal/legal-footer";
import { buttonClass, FormMessage, secondaryButtonClass } from "@/components/ui/field";

export default async function Home({ searchParams }: PageProps<"/">) {
  const deleted = (await searchParams).deleted === "1";
  return (
    <>
    <main id="main" className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold tracking-tight">Ispentit</h1>
      <p className="text-lg text-muted">
        A personal finance tracker. Record what comes in and goes out, and see where your money goes.
        Ispentit organises what you enter; it is not a bank and does not verify balances.
      </p>
      {deleted ? <FormMessage kind="info">Your account and all of its data were deleted.</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className={buttonClass}>
          Create account
        </Link>
        <Link href="/login" className={secondaryButtonClass}>
          Sign in
        </Link>
      </div>
    </main>
    <LegalFooter />
    </>
  );
}
