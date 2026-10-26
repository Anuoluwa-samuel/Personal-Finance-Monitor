// @vitest-environment jsdom
import "../support/dom";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartData } from "@/components/dashboard/data-table";
import { FormMessage } from "@/components/ui/field";

describe("ChartData (text equivalent of a chart)", () => {
  it("offers the same numbers as a real table with column headers", () => {
    render(<ChartData summary="Income ₦10 and expenses ₦4." headers={["Month", "Income", "Expenses"]} rows={[["Jan", "₦10.00", "₦4.00"]]} />);
    expect(screen.getByText("View as table")).toBeInTheDocument();
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent)).toEqual(["Month", "Income", "Expenses"]);
    expect(within(table).getByRole("cell", { name: "₦4.00", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Income ₦10 and expenses ₦4.")).toBeInTheDocument();
  });
});

describe("FormMessage", () => {
  it("errors are announced assertively, confirmations politely", () => {
    const { rerender } = render(<FormMessage kind="error">Bad</FormMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
    rerender(<FormMessage kind="info">Saved</FormMessage>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
