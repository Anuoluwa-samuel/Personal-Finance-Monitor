// @vitest-environment jsdom
import "../support/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/app-shell/main-nav";

const path = "/transactions/abc";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe("MainNav", () => {
  it("marks the current section with aria-current and no other", () => {
    render(<MainNav />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["Transactions"]);
  });

  it("has a Menu button that reports expanded state and closes with Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(<MainNav />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "main-menu");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("lists every destination as links inside a labelled navigation landmark", () => {
    render(<MainNav />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    for (const name of ["Dashboard", "Transactions", "Budgets", "Goals", "Recurring", "Accounts", "Categories", "Settings"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });
});
