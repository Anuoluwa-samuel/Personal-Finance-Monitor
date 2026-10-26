import { readFile } from "node:fs/promises";
import { alertOf, categoryId, expect, newVerifiedUser, sql, stat, test, userIdOf } from "./helpers";

test.describe("empty dataset", () => {
  test("every screen shows an honest empty state, not invented numbers", async ({ page }) => {
    await newVerifiedUser(page, "empty");
    await expect(page.getByText("No transactions recorded yet")).toBeVisible();
    await expect(stat(page, "Income")).toContainText("₦0.00");
    await expect(stat(page, "Expenses")).toContainText("₦0.00");
    await expect(stat(page, "Recorded balance")).toContainText("₦0.00");
    await expect(page.getByText("No income or expenses recorded in this period")).toBeVisible();
    await expect(page.getByText("No transactions in the last 12 months")).toBeVisible();
    await expect(page.getByText(/No budget set for this month/)).toBeVisible();
    await expect(page.getByText("No active savings goals")).toBeVisible();

    const expectations: [string, string | RegExp][] = [
      ["/transactions", "No transactions yet."],
      ["/budgets", "No budgets yet."],
      ["/goals", "No savings goals yet."],
      ["/accounts", /No accounts yet/],
      ["/recurring", /Nothing is waiting/],
    ];
    for (const [path, text] of expectations) {
      await page.goto(path);
      await expect(page.getByText(text).first(), path).toBeVisible();
    }
    await page.goto("/categories");
    await expect(page.getByText("Food and groceries")).toBeVisible(); // defaults exist
    const csv = await (await page.request.get("/api/transactions/export")).text();
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });

  test("an unknown page and a malformed id show a not-found page, never an error dump", async ({ page }) => {
    await newVerifiedUser(page, "nf");
    for (const path of ["/transactions/not-a-uuid", "/budgets/zzz", "/goals/zzz", "/categories/zzz/edit"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Not found" }), path).toBeVisible();
      expect(await page.content()).not.toMatch(/node_modules|at \/Users|relation "|ZodError/);
    }
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
  });
});

test.describe("large history", () => {
  test("1,500 transactions paginate, sort, export and add up exactly", async ({ page }) => {
    const email = await newVerifiedUser(page, "big");
    const uid = await userIdOf(email);
    const food = await categoryId("Food and groceries", "expense");
    const salary = await categoryId("Salary", "income");
    await sql`
      insert into transactions (user_id, kind, amount, description, category_id, transaction_date)
      select ${uid}, case when n % 10 = 0 then 'income'::flow_type else 'expense'::flow_type end,
             ((n * 7919) % 500000 + 1) / 100.0,
             'bulk ' || n,
             case when n % 10 = 0 then ${salary}::uuid else ${food}::uuid end,
             date '2025-01-01' + (n % 365)
      from generate_series(1, 1500) as n`;
    const [{ inc, exp }] = await sql`
      select coalesce(sum(amount) filter (where kind='income'),0) inc, coalesce(sum(amount) filter (where kind='expense'),0) exp
      from transactions where user_id = ${uid}`;
    const fmt = (v: string) => "₦" + Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    await page.goto("/transactions");
    await expect(page.getByText("1500 transactions")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pagination" }).getByText("Page 1 of 60")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByRole("navigation", { name: "Pagination" }).getByText("Page 2 of 60")).toBeVisible();
    await page.goto("/transactions?page=60");
    await expect(page.getByRole("navigation", { name: "Pagination" }).getByText("Page 60 of 60")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
    await page.goto("/transactions?order=amount_desc");
    const [{ top }] = await sql`select max(amount) top from transactions where user_id = ${uid}`;
    await expect(page.locator("tbody tr").first()).toContainText(fmt(top));

    const started = Date.now();
    await page.goto("/dashboard?period=custom&from=2025-01-01&to=2025-12-31");
    await expect(stat(page, "Income")).toContainText(fmt(inc));
    await expect(stat(page, "Expenses")).toContainText(fmt(exp));
    expect(Date.now() - started, "dashboard over 1,500 rows should load quickly").toBeLessThan(5000);

    const [download] = await Promise.all([page.waitForEvent("download"), page.goto("/transactions").then(() => page.getByRole("link", { name: /Export CSV/ }).click())]);
    const csv = await readFile(await download.path(), "utf8");
    expect(csv.trim().split("\r\n")).toHaveLength(1501);
  });
});

test.describe("recurring items stay planned until confirmed", () => {
  test("a due rule appears as planned, changes no totals, and one confirmation makes exactly one transaction", async ({ page }) => {
    const email = await newVerifiedUser(page, "rec");
    const uid = await userIdOf(email);
    const housing = await categoryId("Housing", "expense");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    await sql`insert into recurring_rule (user_id, kind, amount, description, category_id, frequency, interval_count, start_date)
              values (${uid}, 'expense', 50000, 'E2E Rent', ${housing}, 'monthly', 1, ${today})`;
    await page.goto("/dashboard");
    await expect(page.getByText(/1 recurring item is waiting/)).toBeVisible();
    await expect(stat(page, "Expenses")).toContainText("₦0.00");

    await page.goto("/recurring");
    await expect(page.getByText("planned for")).toBeVisible();
    await page.getByRole("button", { name: "Confirm paid" }).click();
    await expect(page.getByText("Nothing is waiting")).toBeVisible();
    await page.goto("/dashboard");
    await expect(stat(page, "Expenses")).toContainText("₦50,000.00");
    const [{ n }] = await sql`select count(*)::int n from transactions where user_id = ${uid}`;
    expect(n).toBe(1);
  });
});

test.describe("CSV import", () => {
  test("a bad file is refused with row-level errors; a good file imports once and a re-upload is recognised", async ({ page }) => {
    await newVerifiedUser(page, "imp");
    const header = "Date,Type,Amount,Description,Category,Notes\r\n";
    const upload = async (csv: string) => {
      await page.goto("/transactions/import");
      await page.setInputFiles("#file", { name: "t.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.getByRole("button", { name: "Preview import" }).click();
    };

    await upload(header + "2025-02-30,expense,10,Bad date,Food and groceries,\r\n2025-03-01,expense,abc,Bad amount,Nope,\r\n");
    await expect(alertOf(page)).toContainText("Nothing was imported");
    await expect(page.getByText(/Line 2:/)).toBeVisible();
    await expect(page.getByText(/Line 3:/)).toBeVisible();

    const good = header + '2025-03-02,expense,25.50,Lunch,Food and groceries,\r\n2025-03-03,income,1000,"\'=SUM(A1)",Salary,\r\n';
    await upload(good);
    await expect(page.getByText("2 new transactions will be added")).toBeVisible();
    await page.getByRole("button", { name: "Import 2 transactions" }).click();
    await expect(page.getByText("Imported 2 transactions.")).toBeVisible();
    await expect(page.getByRole("link", { name: "=SUM(A1)", exact: true })).toBeVisible(); // stored as inert text

    await upload(good);
    await expect(page.getByText("2 rows were already imported earlier")).toBeVisible();
    await expect(page.getByText("Nothing new to import")).toBeVisible();
  });
});
