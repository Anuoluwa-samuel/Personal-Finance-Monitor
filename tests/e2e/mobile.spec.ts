import { expect, newVerifiedUser, test } from "./helpers";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const PRIVATE = ["/dashboard", "/transactions", "/transactions/new", "/transactions/import", "/budgets", "/budgets/new", "/goals", "/goals/new", "/accounts", "/recurring", "/recurring/new", "/categories", "/settings"];
const PUBLIC = ["/", "/login", "/register", "/forgot-password", "/terms", "/privacy"];

test("no screen scrolls sideways at phone width", async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await newVerifiedUser(page, "mobile");
  for (const path of PRIVATE) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("the navigation collapses into a menu that opens, navigates and closes", async ({ page }) => {
  await newVerifiedUser(page, "menu");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("link", { name: "Budgets", exact: true })).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Budgets", exact: true }).click();
  await expect(page).toHaveURL(/\/budgets$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false"); // closes on navigation
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

test("form controls and buttons are comfortably tappable (at least 44px high)", async ({ page }) => {
  await newVerifiedUser(page, "tap");
  for (const path of ["/transactions/new", "/goals/new"]) {
    await page.goto(path);
    const boxes = await page.locator("main input:not([type=hidden]):not(.sr-only), main select, main textarea, main button, main a[class*=min-h-11]").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => ({ tag: e.tagName, h: Math.round(e.getBoundingClientRect().height), label: (e.textContent || (e as HTMLInputElement).name || "").trim().slice(0, 30) })),
    );
    for (const b of boxes) {
      if (b.tag === "TEXTAREA") continue;
      expect(b.h, `${path} ${b.tag} "${b.label}"`).toBeGreaterThanOrEqual(43);
    }
  }
});

test("a transaction can be added with the phone keyboard-sized viewport and the table scrolls inside its own container", async ({ page }) => {
  await newVerifiedUser(page, "add");
  await page.goto("/transactions/new");
  await page.getByLabel("Amount (NGN)").fill("1234.56");
  await page.getByLabel("Description").fill("Mobile coffee");
  await page.getByLabel("Category").selectOption({ label: "Food and groceries" });
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("link", { name: "Mobile coffee", exact: true })).toBeVisible();
  const scroller = page.locator("main div.overflow-x-auto").first();
  expect(await scroller.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // wide table scrolls within its box
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // not the page
});
