import Link from "next/link";
import { LEGAL_EFFECTIVE_DATE, legalDetails } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm underline">← Ispentit</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Effective {LEGAL_EFFECTIVE_DATE}</p>
      <div className="mt-6 space-y-8 leading-relaxed [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </div>
  );
}

export function Operator() {
  const { operator } = legalDetails();
  return <>{operator ?? "the operator of this Ispentit service"}</>;
}

export function ContactLine() {
  const { email } = legalDetails();
  return email ? (
    <a href={`mailto:${email}`} className="underline">{email}</a>
  ) : (
    <span>the contact address published by the operator (it has not been configured for this deployment)</span>
  );
}
