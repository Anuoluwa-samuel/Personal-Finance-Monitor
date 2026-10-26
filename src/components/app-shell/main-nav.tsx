"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/goals", label: "Goals" },
  { href: "/recurring", label: "Recurring" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
  { href: "/settings", label: "Settings" },
];

/** Desktop: a row of links. Phone: a "Menu" disclosure button that closes on navigation or Escape. */
export function MainNav() {
  const pathname = usePathname();
  // The menu counts as open only on the page where it was opened, so navigating closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenedOn((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- setOpen only writes state

  const link = (l: (typeof LINKS)[number]) => {
    const current = pathname === l.href || pathname.startsWith(l.href + "/");
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={current ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-md px-2 text-sm ${current ? "font-semibold underline decoration-2 underline-offset-8" : "text-foreground"}`}
      >
        {l.label}
      </Link>
    );
  };

  return (
    <nav aria-label="Main" className="flex-1">
      <button
        ref={button}
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm md:hidden"
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        Menu
      </button>
      <ul id="main-menu" className={`${open ? "mt-2 flex" : "hidden"} flex-col gap-1 md:mt-0 md:flex md:flex-row md:flex-wrap md:items-center md:gap-x-1`}>
        {LINKS.map((l) => (
          <li key={l.href}>{link(l)}</li>
        ))}
      </ul>
    </nav>
  );
}
