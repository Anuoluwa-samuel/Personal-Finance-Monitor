// @vitest-environment jsdom
import "../support/dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { GoalProgress } from "@/components/goals/goal-progress";
import type { GoalDTO, } from "@/server/savings";
import type { ProgressDTO } from "@/server/budgets";

const p = (over: Partial<ProgressDTO>): ProgressDTO => ({ limit: "1000.00", spent: "100.00", remaining: "900.00", percent: 10, status: "ok", ...over });

describe("BudgetProgress", () => {
  it.each([
    [p({}), /On track/],
    [p({ spent: "850.00", remaining: "150.00", percent: 85, status: "approaching" }), /Approaching the limit, 85% used/],
    [p({ spent: "1000.00", remaining: "0.00", percent: 100, status: "reached" }), /Limit reached/],
    [p({ spent: "1250.00", remaining: "-250.00", percent: 125, status: "over" }), /Over by ₦250\.00/],
  ])("states the status in words, not only colour", (progress, text) => {
    render(<BudgetProgress label="Food" p={progress} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("exposes an accessible progress bar capped at 100", () => {
    render(<BudgetProgress label="Food" p={p({ spent: "1250.00", remaining: "-250.00", percent: 125, status: "over" })} />);
    const bar = screen.getByRole("progressbar", { name: /Food: ₦1,250\.00 spent of ₦1,000\.00/ });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });
});

describe("GoalProgress", () => {
  const goal = (reached: boolean): GoalDTO => ({
    id: "g", name: "Laptop", target: "1000.00", startingAmount: "0.00", targetDate: null, status: "active", createdAt: "", completedAt: null,
    progress: { contributed: reached ? "1000.00" : "250.00", saved: reached ? "1000.00" : "250.00", remaining: reached ? "0.00" : "750.00", percent: reached ? 100 : 25, reached },
  });
  it("shows what is left, or that the target is reached", () => {
    const { rerender } = render(<GoalProgress goal={goal(false)} />);
    expect(screen.getByText(/₦750\.00 to go/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Laptop: ₦250\.00 saved of ₦1,000\.00/ })).toHaveAttribute("aria-valuenow", "25");
    rerender(<GoalProgress goal={goal(true)} />);
    expect(screen.getByText("Target reached")).toBeInTheDocument();
  });
});
