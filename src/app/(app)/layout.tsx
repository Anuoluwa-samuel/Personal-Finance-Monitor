import Link from "next/link";
import { redirect } from "next/navigation";
import { LegalFooter } from "@/components/legal/legal-footer";
import { MainNav } from "@/components/app-shell/main-nav";
import { ThemeSelect } from "@/components/app-shell/theme-select";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getTheme } from "@/server/preferences";
import { getSessionUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const theme = await getTheme(user.id);
  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight">
            Ispentit
          </Link>
          <div className="order-2 flex items-center gap-3 md:order-3">
            <ThemeSelect value={theme} />
            <SignOutButton />
          </div>
          <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
            <MainNav />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 focus:outline-none">
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}
