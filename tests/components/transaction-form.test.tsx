// @vitest-environment jsdom
import "../support/dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { FormState } from "@/server/form";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const categories = [
  { id: "e1", name: "Food", type: "expense" as const },
  { id: "e2", name: "Transport", type: "expense" as const },
  { id: "i1", name: "Salary", type: "income" as const },
];
const initial = { kind: "expense" as const, amount: "", description: "", categoryId: "", accountId: "", transactionDate: "2025-03-01", notes: "" };
const noop = async (): Promise<FormState> => null;

describe("TransactionForm", () => {
  it("labels every field and offers only categories matching the type", () => {
    render(<TransactionForm action={noop} categories={categories} accounts={[]} initial={initial} submitLabel="Save" cancelHref="/t" />);
    for (const name of [/Amount/, /Description/, /Category/, /Date/, /Notes/]) expect(screen.getByLabelText(name)).toBeInTheDocument();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a category", "Food", "Transport"]);
    expect(screen.queryByLabelText(/Account/)).not.toBeInTheDocument(); // hidden when the user has no accounts
  });

  it("switching to income swaps the category list and clears a mismatched selection", async () => {
    const user = userEvent.setup();
    render(<TransactionForm action={noop} categories={categories} accounts={[]} initial={{ ...initial, categoryId: "e1" }} submitLabel="Save" cancelHref="/t" />);
    expect(screen.getByLabelText("Category")).toHaveValue("e1");
    await user.click(screen.getByLabelText("Income"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose a category", "Salary"]);
    expect(screen.getByLabelText("Category")).toHaveValue("");
  });

  it("shows server validation errors next to their fields, announced and linked", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<FormState> => ({
      message: "Some fields are invalid",
      fields: { amount: "Use at most 2 decimal places" },
      values: { ...initial, amount: "1.234", description: "Lunch" },
    }));
    render(<TransactionForm action={action} categories={categories} accounts={[]} initial={initial} submitLabel="Save" cancelHref="/t" />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Some fields are invalid"));
    const amount = screen.getByLabelText(/Amount/);
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAccessibleDescription("Use at most 2 decimal places");
    expect(amount).toHaveValue("1.234"); // the user's input is kept
    expect(screen.getByLabelText("Description")).toHaveValue("Lunch");
  });

  it("includes the account choice when accounts exist", () => {
    render(<TransactionForm action={noop} categories={categories} accounts={[{ id: "a1", name: "GTBank" }]} initial={initial} submitLabel="Save" cancelHref="/t" />);
    expect(screen.getByLabelText(/Account/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GTBank" })).toBeInTheDocument();
  });
});
