import { alertOf, expect, newUserContext, newVerifiedUser, signIn, sql, test, uniqueEmail, userIdOf, verificationUrl, register } from "./helpers";
import { PASSWORD } from "./env";

const NEW_PASSWORD = "an-even-better-passphrase-42";

test.describe("settings and account lifecycle", () => {
  test("preferences persist: timezone, theme and name survive a reload, and the theme applies on the server render", async ({ page }) => {
    const email = await newVerifiedUser(page, "prefs");
    await page.goto("/settings");
    await page.getByLabel("Name").fill("Renamed Person");
    await page.getByLabel("Timezone").selectOption("Europe/London");
    await page.locator("main").getByLabel("Theme").selectOption("dark");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Renamed Person");
    await expect(page.getByLabel("Timezone")).toHaveValue("Europe/London");
    await expect(page.locator("main").getByLabel("Theme")).toHaveValue("dark");
    const [row] = await sql`select p.timezone, p.theme, u.name from user_preferences p join "user" u on u.id = p.user_id where u.email = ${email}`;
    expect(row).toMatchObject({ timezone: "Europe/London", theme: "dark", name: "Renamed Person" });

    await page.locator("header select").selectOption("light"); // the quick toggle in the header
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("invalid preferences are rejected by the server", async ({ page }) => {
    await newVerifiedUser(page, "badprefs");
    await page.goto("/settings");
    await page.getByLabel("Name").fill("   ");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(alertOf(page)).toBeVisible();
    await expect(page.locator("#name-error")).toContainText("Enter a name");
  });

  test("forgot password: the answer is the same for unknown addresses, and the emailed link really resets the password", async ({ page, browser }) => {
    const email = await newVerifiedUser(page, "forgot");
    await page.context().clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@e2e.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const unknownAnswer = await page.getByRole("status").innerText();

    const other = await newUserContext(browser);
    const p2 = await other.newPage();
    await p2.goto("/forgot-password");
    await p2.getByLabel("Email").fill(email);
    await p2.getByRole("button", { name: "Send reset link" }).click();
    expect(await p2.getByRole("status").innerText()).toBe(unknownAnswer); // identical wording: no account enumeration

    // The provider is not configured here, so read the one-time token the app stored (the same token the email link carries).
    const uid = await userIdOf(email);
    const [{ identifier }] = await sql`select identifier from verification where value = ${uid} and identifier like 'reset-password:%' order by created_at desc limit 1`;
    const token = (identifier as string).replace("reset-password:", "");

    await p2.goto(`/reset-password?token=${token}`);
    await p2.getByLabel("New password").fill(NEW_PASSWORD);
    await p2.getByRole("button", { name: "Set new password" }).click();
    await expect(p2.getByRole("status")).toContainText("Password updated");

    await p2.goto("/reset-password?token=" + token); // single use
    await p2.getByLabel("New password").fill("yet-another-password-77");
    await p2.getByRole("button", { name: "Set new password" }).click();
    await expect(alertOf(p2)).toContainText("invalid or has expired");

    await signIn(p2, email, PASSWORD);
    await expect(alertOf(p2)).toContainText("Incorrect email or password"); // the old password no longer works
    await signIn(p2, email, NEW_PASSWORD);
    await expect(p2).toHaveURL(/\/dashboard$/);
    await other.close();
  });

  test("changing the password signs out the user's other devices", async ({ browser }) => {
    const a = await newUserContext(browser);
    const pa = await a.newPage();
    const email = await newVerifiedUser(pa, "pwchange");

    const b = await newUserContext(browser);
    const pb = await b.newPage();
    await signIn(pb, email);
    await expect(pb).toHaveURL(/\/dashboard$/);

    await pa.goto("/settings");
    await expect(pa.getByText("This device")).toBeVisible();
    await expect(pa.getByText("Another device")).toBeVisible();
    await pa.getByLabel("Current password").fill(PASSWORD);
    await pa.getByLabel("New password").fill(NEW_PASSWORD);
    await pa.getByRole("button", { name: "Change password" }).click();
    await expect(pa.getByRole("status")).toContainText("signed out of your other devices");

    await pb.goto("/dashboard");
    await expect(pb).toHaveURL(/\/login$/);
    await pa.goto("/dashboard");
    await expect(pa).toHaveURL(/\/dashboard$/); // this device stays signed in
    await a.close();
    await b.close();
  });

  test("a user can end another device's session from the device list", async ({ browser }) => {
    const a = await newUserContext(browser);
    const pa = await a.newPage();
    const email = await newVerifiedUser(pa, "revoke");
    const b = await newUserContext(browser);
    const pb = await b.newPage();
    await signIn(pb, email);
    await expect(pb).toHaveURL(/\/dashboard$/);

    await pa.goto("/settings");
    await pa.getByRole("button", { name: /Sign out of all other devices/ }).click();
    await expect(pa.getByText("Another device")).toHaveCount(0);
    await pb.goto("/dashboard");
    await expect(pb).toHaveURL(/\/login$/);
    await a.close();
    await b.close();
  });

  test("account deletion: a wrong password changes nothing; the right one erases the account and all its data", async ({ page }) => {
    const email = await newVerifiedUser(page, "delete");
    const uid = await userIdOf(email);
    await sql`insert into transactions (user_id, kind, amount, description, category_id, transaction_date)
              select ${uid}, 'expense', 12.34, 'doomed', id, current_date from category where user_id is null and name = 'Transport'`;
    await sql`insert into money_account (user_id, name) values (${uid}, 'Doomed account')`;
    await sql`insert into savings_goal (user_id, name, target) values (${uid}, 'Doomed goal', 1000)`;

    await page.goto("/settings");
    await page.getByRole("button", { name: /Delete my account/ }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog.getByLabel("Enter your password to confirm").fill("wrong-password-1");
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(dialog.getByRole("alert")).toContainText("not correct");
    expect((await sql`select 1 from "user" where id = ${uid}`).length).toBe(1);

    await dialog.getByLabel("Enter your password to confirm").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL(/\/\?deleted=1$/);
    await expect(page.getByText("Your account and all of its data were deleted.")).toBeVisible();

    for (const table of ["transactions", "money_account", "savings_goal", "session", "user_preferences"]) {
      const rows = await sql.unsafe(`select 1 from ${table} where user_id = $1`, [uid]);
      expect(rows.length, table).toBe(0);
    }
    expect((await sql`select 1 from "user" where id = ${uid}`).length).toBe(0);
    await signIn(page, email);
    await expect(alertOf(page)).toContainText("Incorrect email or password");
  });

  test("deleting the account also works from a session that is days old", async ({ page }) => {
    const email = await newVerifiedUser(page, "stale");
    const uid = await userIdOf(email);
    await sql`update session set created_at = now() - interval '3 days', updated_at = now() - interval '3 hours' where user_id = ${uid}`;
    await page.goto("/settings");
    await page.getByRole("button", { name: /Delete my account/ }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog.getByLabel("Enter your password to confirm").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL(/\/\?deleted=1$/, { timeout: 15_000 });
    expect((await sql`select 1 from "user" where id = ${uid}`).length).toBe(0);
  });

  test("registering with an address that already exists reveals nothing and does not take over the account", async ({ page, browser }) => {
    const email = await newVerifiedUser(page, "dupe");
    const ctx = await newUserContext(browser);
    const p = await ctx.newPage();
    await register(p, "Imposter", email, "imposter-password-1");
    await signIn(p, email, "imposter-password-1");
    await expect(alertOf(p)).toContainText(/Incorrect email or password|verify your email/);
    await signIn(p, email, PASSWORD); // the real owner's password still works
    await expect(p).toHaveURL(/\/dashboard$/);
    await ctx.close();
    void uniqueEmail; void verificationUrl;
  });
});
