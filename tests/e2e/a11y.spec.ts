import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { BASE_URL } from "./env";
import { categoryId, contextOptions, expect, newVerifiedUser, sql, test, userIdOf } from "./helpers";

/**
 * Automated accessibility checks. axe-core catches roughly a third of real problems (contrast, names, roles, structure);
 * it does NOT replace testing with a screen reader and keyboard. Scripts are injected with CSP bypassed for these
 * contexts only, because the app's CSP (correctly) forbids injected scripts.
 */
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function audit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async (tags) => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return r.violations.map((v: { id: string; help: string; nodes: { target: unknown[] }[] }) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }, TAGS);
  expect(violations, path).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`axe finds no violations on any screen (${theme} theme)`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ ...contextOptions(), bypassCSP: true });
    await context.addCookies([{ name: "theme", value: theme, url: BASE_URL }]);
    const page = await context.newPage();

    for (const path of ["/", "/login", "/register", "/forgot-password", "/terms", "/privacy"]) await audit(page, path);

    const email = await newVerifiedUser(page, `a11y-${theme}`);
    const uid = await userIdOf(email);
    const food = await categoryId("Food and groceries", "expense");
    const salary = await categoryId("Salary", "income");
    const housing = await categoryId("Housing", "expense");
    await sql`insert into transactions (user_id, kind, amount, description, category_id, transaction_date)
              select ${uid}, case when n % 4 = 0 then 'income'::flow_type else 'expense'::flow_type end, n * 1250.50, 'a11y ' || n,
                     case when n % 4 = 0 then ${salary}::uuid else ${food}::uuid end, current_date - n from generate_series(1, 12) n`;
    const [{ id: txId }] = await sql`select id from transactions where user_id = ${uid} limit 1`;
    const [{ id: budgetId }] = await sql`insert into budget (user_id, month, overall_limit) values (${uid}, date_trunc('month', current_date)::date, 40000) returning id`;
    await sql`insert into budget_line (budget_id, category_id, "limit") values (${budgetId}, ${food}, 5000)`;
    const [{ id: goalId }] = await sql`insert into savings_goal (user_id, name, target, starting_amount) values (${uid}, 'A11y laptop', 450000, 1000) returning id`;
    await sql`insert into savings_contribution (goal_id, user_id, amount, contributed_on, note) values (${goalId}, ${uid}, 25000, current_date, 'note')`;
    const [{ id: accId }] = await sql`insert into money_account (user_id, name, opening_balance) values (${uid}, 'Cash', 100) returning id`;
    const [{ id: ruleId }] = await sql`insert into recurring_rule (user_id, kind, amount, description, category_id, frequency, interval_count, start_date)
                                       values (${uid}, 'expense', 5000, 'Rent', ${housing}, 'monthly', 1, current_date - 40) returning id`;
    void accId; void ruleId;

    const paths = [
      "/dashboard", "/transactions", "/transactions/new", "/transactions/import", `/transactions/${txId}`, `/transactions/${txId}/edit`,
      "/budgets", "/budgets/new", `/budgets/${budgetId}`, `/budgets/${budgetId}/edit`, "/goals", "/goals/new", `/goals/${goalId}`, `/goals/${goalId}/edit`,
      "/accounts", "/recurring", "/recurring/new", "/categories", "/settings",
      "/dashboard?period=last_90", "/transactions?q=a11y&kind=expense",
    ];
    for (const path of paths) await audit(page, path);
    await context.close();
  });
}

test.describe("keyboard and motion", () => {
  test("the first Tab stop is the skip link, and it moves focus to the main content", async ({ page }) => {
    await newVerifiedUser(page, "kbd");
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
  });

  test("the sign-in form has a logical tab order and a visible focus ring", async ({ page }) => {
    await page.goto("/login");
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      order.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return (e.getAttribute("id") || e.textContent || e.tagName).trim().slice(0, 24); }));
    }
    expect(order.slice(0, 4)).toContain("email");
    expect(order.indexOf("email")).toBeLessThan(order.indexOf("password"));
    expect(order.indexOf("password")).toBeLessThan(order.findIndex((o) => o === "Sign in"));
    await page.getByLabel("Email").focus();
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test("the delete confirmation is a real modal dialog: Escape closes it and focus returns to its trigger", async ({ page }) => {
    await newVerifiedUser(page, "dlg");
    await page.goto("/transactions/new");
    await page.getByLabel("Amount (NGN)").fill("5");
    await page.getByLabel("Description").fill("to delete");
    await page.getByLabel("Category").selectOption({ label: "Transport" });
    await page.getByRole("button", { name: "Save transaction" }).click();
    await page.getByRole("link", { name: "to delete", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Delete", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Delete this transaction?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true); // focus stays inside
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("reduced-motion preference removes transitions and animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    const durations = await page.evaluate(() => [...document.querySelectorAll("a, button, input")].map((e) => parseFloat(getComputedStyle(e).transitionDuration)));
    expect(durations.length).toBeGreaterThan(3);
    expect(Math.max(...durations)).toBeLessThan(0.001);
  });

  test("form errors are announced and tied to their fields", async ({ page }) => {
    await newVerifiedUser(page, "err");
    await page.goto("/transactions/new");
    await page.getByLabel("Amount (NGN)").fill("1.234");
    await page.getByLabel("Description").fill("x");
    await page.getByLabel("Category").selectOption({ label: "Transport" });
    await page.getByRole("button", { name: "Save transaction" }).click();
    const amount = page.getByLabel("Amount (NGN)");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAccessibleDescription(/at most 2 decimal places/i);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
  });
});
