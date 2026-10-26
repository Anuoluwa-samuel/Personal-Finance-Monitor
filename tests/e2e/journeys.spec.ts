import { readFile } from "node:fs/promises";
import type { BrowserContext, Page } from "@playwright/test";
import { BASE_URL } from "./env";
import { alertOf, expect, newUserContext, newVerifiedUser, test, register, signIn, signOut, sql, stat, uniqueEmail, verificationUrl } from "./helpers";

/**
 * The 14 end-to-end journeys from the project brief (section 18), in order, through the real UI against a
 * production build. They share one user ("alice") and run serially because each step builds on the last.
 */
async function addTransaction(page: Page, kind: "Income" | "Expense", amount: string, description: string, category: string) {
  await page.goto("/transactions/new");
  await page.locator("label", { hasText: new RegExp(`^${kind}$`) }).click();
  await page.getByLabel("Amount (NGN)").fill(amount);
  await page.getByLabel("Description").fill(description);
  await page.getByLabel("Category").selectOption({ label: category });
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("link", { name: description, exact: true })).toBeVisible();
}

test.describe.serial("brief journeys 1-14", () => {
  let context: BrowserContext;
  let page: Page;
  const aliceEmail = uniqueEmail("alice");
  let lunchId = "";

  test.beforeAll(async ({ browser }) => {
    context = await newUserContext(browser);
    page = await context.newPage();
  });
  test.afterAll(async () => context.close());

  test("1. a new user registers and cannot sign in until the email is verified", async () => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toBeVisible();
    await register(page, "Alice E2E", aliceEmail);
    await signIn(page, aliceEmail);
    await expect(alertOf(page)).toContainText("verify your email first");
    await expect(page).toHaveURL(/\/login/);
  });

  test("1b. verifying through the real verification endpoint signs them in", async () => {
    await page.goto(await verificationUrl(aliceEmail));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("No transactions recorded yet")).toBeVisible();
  });

  test("2. the user logs out and logs in again", async () => {
    await signOut(page);
    await signIn(page, aliceEmail);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("3. creates income and expense transactions", async () => {
    await addTransaction(page, "Income", "250000.50", "E2E Salary", "Salary");
    await addTransaction(page, "Expense", "1500.25", "E2E Lunch", "Food and groceries");
    await addTransaction(page, "Expense", "4000", "E2E Fuel", "Transport");
    await expect(page.getByText("3 transactions")).toBeVisible();
  });

  test("4. the dashboard shows the correct totals", async () => {
    await page.goto("/dashboard");
    await expect(stat(page, "Income")).toContainText("₦250,000.50");
    await expect(stat(page, "Expenses")).toContainText("₦5,500.25");
    await expect(stat(page, "Net cash flow")).toContainText("₦244,500.25");
    await expect(stat(page, "Recorded balance")).toContainText("₦244,500.25");
    await expect(page.getByText("Where the money went")).toBeVisible();
  });

  test("5-6. creates a monthly budget that reflects the eligible expenses", async () => {
    await page.goto("/budgets/new");
    await page.getByLabel("Overall spending limit (NGN)").fill("10000");
    await page.getByRole("button", { name: "Add category limit" }).click();
    await page.getByLabel("Category 1").selectOption({ label: "Food and groceries" });
    await page.getByLabel("Limit (NGN)", { exact: true }).fill("1500");
    await page.getByRole("button", { name: "Create budget" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /budget$/ })).toBeVisible();
    await expect(page.getByText("Total spent in the month:")).toContainText("₦5,500.25");
    await expect(page.getByText("₦5,500.25 of ₦10,000.00")).toBeVisible(); // overall: expenses only, income ignored
    await expect(page.getByText("On track").first()).toBeVisible();
    await expect(page.getByText("₦1,500.25 of ₦1,500.00")).toBeVisible();
    await expect(page.getByText("Over by ₦0.25")).toBeVisible(); // stated in words, not only colour
  });

  test("7-8. creates a savings goal and records a contribution (with an over-target attempt refused)", async () => {
    await page.goto("/goals/new");
    await page.getByLabel("Goal name").fill("E2E Laptop");
    await page.getByLabel("Target amount (NGN)").fill("450000");
    await page.getByLabel(/Already saved/).fill("50000");
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Laptop" })).toBeVisible();

    await page.getByLabel("Amount (NGN)").fill("999999");
    await page.getByRole("button", { name: "Record contribution" }).click();
    await expect(alertOf(page)).toContainText("Only ₦400,000.00 is left to reach the target");

    await page.getByLabel("Amount (NGN)").fill("25000.75");
    await page.getByLabel(/Note/).fill("first save");
    await page.getByRole("button", { name: "Record contribution" }).click();
    await expect(page.getByText("₦75,000.75 of ₦450,000.00")).toBeVisible();
    await expect(page.getByRole("cell", { name: "first save" })).toBeVisible();
  });

  test("9. analytics reflect the underlying records and goals stay separate from income and expenses", async () => {
    await page.goto("/dashboard");
    await expect(page.getByText("₦25,000.75").first()).toBeVisible(); // set aside for goals this month
    await expect(stat(page, "Expenses")).toContainText("₦5,500.25"); // unchanged by the contribution
    await expect(stat(page, "Recorded balance")).toContainText("₦244,500.25");
    await expect(page.getByText("Food and groceries").first()).toBeVisible();
    await expect(page.getByText(/Budget for/)).toBeVisible();
  });

  test("10. filters the history and exports it as a safe CSV", async () => {
    await page.goto("/transactions");
    await page.getByLabel("Search description").fill("Lunch");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByText("1 transaction match your filters")).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Fuel", exact: true })).toHaveCount(0);

    const [filtered] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export CSV/ }).click()]);
    const filteredText = await readFile(await filtered.path(), "utf8");
    expect(filteredText.charCodeAt(0)).toBe(0xfeff);
    expect(filteredText).toContain("Date,Type,Amount,Currency,Description,Category,Account,Notes");
    expect(filteredText).toContain("E2E Lunch");
    expect(filteredText).not.toContain("E2E Salary");

    await page.goto("/transactions");
    const [all] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export CSV/ }).click()]);
    const allText = await readFile(await all.path(), "utf8");
    expect(allText.trim().split("\r\n")).toHaveLength(4); // header + 3 rows
    expect(allText).toContain("250000.50");
  });

  test("11. edits one transaction and deletes another", async () => {
    await page.goto("/transactions");
    lunchId = (await page.getByRole("link", { name: "E2E Lunch", exact: true }).getAttribute("href"))!.split("/").pop()!;
    await page.getByRole("link", { name: "E2E Lunch", exact: true }).click();
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.getByLabel("Amount (NGN)").fill("2000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("−₦2,000.00")).toBeVisible();

    await page.goto("/transactions");
    await page.getByRole("link", { name: "E2E Fuel", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByRole("link", { name: "E2E Fuel", exact: true })).toHaveCount(0);
    await expect(page.getByText("2 transactions")).toBeVisible();
  });

  test("12. the dashboard, budget and reports update correctly", async () => {
    await page.goto("/dashboard");
    await expect(stat(page, "Expenses")).toContainText("₦2,000.00");
    await expect(stat(page, "Net cash flow")).toContainText("₦248,000.50");
    await expect(stat(page, "Recorded balance")).toContainText("₦248,000.50");
    await page.goto("/budgets");
    await page.getByRole("link", { name: /20\d\d$/ }).first().click();
    await expect(page.getByText("Total spent in the month:")).toContainText("₦2,000.00");
    await expect(page.getByText("Over by ₦500.00")).toBeVisible();
  });

  test("13. after logging out, protected pages and data are no longer reachable", async () => {
    await page.goto("/transactions");
    await signOut(page);
    for (const path of ["/dashboard", "/transactions", "/budgets", "/goals", "/settings", `/transactions/${lunchId}`]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
    expect((await context.request.get("/api/transactions")).status()).toBe(401);
    expect((await context.request.get("/api/transactions/export")).status()).toBe(401);
  });

  test("14. a second user can neither read nor modify the first user's records", async ({ browser }) => {
    const bobCtx = await newUserContext(browser);
    const bob = await bobCtx.newPage();
    await newVerifiedUser(bob, "bob");

    await bob.goto(`/transactions/${lunchId}`);
    await expect(bob.getByRole("heading", { name: "Not found" })).toBeVisible();
    await bob.goto(`/transactions/${lunchId}/edit`);
    await expect(bob.getByRole("heading", { name: "Not found" })).toBeVisible();

    const origin = { origin: BASE_URL };
    expect((await bobCtx.request.get(`/api/transactions/${lunchId}`)).status()).toBe(404);
    expect((await bobCtx.request.patch(`/api/transactions/${lunchId}`, { data: { amount: "1" }, headers: origin })).status()).toBe(404);
    expect((await bobCtx.request.delete(`/api/transactions/${lunchId}`, { headers: origin })).status()).toBe(404);

    await bob.goto("/transactions");
    await expect(bob.getByText("0 transactions")).toBeVisible();
    await bob.goto("/dashboard");
    await expect(stat(bob, "Income")).toContainText("₦0.00");
    const exported = await bobCtx.request.get("/api/transactions/export");
    const csv = await exported.text();
    expect(csv).not.toContain("E2E");
    expect(csv.trim().split("\r\n")).toHaveLength(1); // header only
    for (const p of ["/budgets", "/goals"]) {
      await bob.goto(p);
      await expect(bob.getByText(/No (budgets|savings goals) yet/)).toBeVisible();
    }
    await bobCtx.close();

    // Alice's record is untouched by all of the above.
    const [row] = await sql`select amount, description from transactions where id = ${lunchId}`;
    expect(row).toMatchObject({ description: "E2E Lunch", amount: "2000.0000" });
  });
});

