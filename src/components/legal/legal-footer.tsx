import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="border-t border-border">
      <nav aria-label="Legal" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 px-4 py-2 text-sm text-muted">
        <Link href="/terms" className="inline-flex min-h-11 items-center underline">Terms of Service</Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center underline">Privacy Policy</Link>
        <span>Ispentit organises what you record. It is not a bank and does not give financial advice.</span>
      </nav>
    </footer>
  );
}
