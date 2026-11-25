import type { Browser } from "@playwright/test";
import { E2E_CLUB, E2E_FACTORY, expect, notice, open, sessionFile, test, unique, type Role } from "./helpers";

// The main order flow across the three kinds of user: an admin adds an order for E2E Club, accepts it and
// assigns it to E2E Factory; the factory user and the client user then see it In production; the admin
// deletes it at the end.
test.use({ storageState: sessionFile("admin") });

const asUser = async (browser: Browser, role: Role) => (await browser.newContext({ storageState: sessionFile(role) })).newPage();

test("an order goes from added to In production, and the factory and client see it", async ({ page, browser }) => {
  const id = unique("E2E").replace(" ", "_");

  // Added by the admin.
  await open(page, "/customs/new");
  await page.getByLabel("Margen order ID").fill(id);
  await page.locator('select[name="organization_id"]').selectOption({ label: E2E_CLUB });
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: id })).toBeVisible();
  const orderPage = page.url();

  // Accepted, then assigned to the factory, which puts it In production.
  await page.getByLabel("Order status").selectOption("accepted");
  await expect(page.getByLabel("Order status")).toHaveValue("accepted");
  await page.getByLabel("Factory", { exact: true }).selectOption({ label: E2E_FACTORY });
  await expect(page.getByLabel("Order status")).toHaveValue("in_production");

  try {
    // The factory user sees it in In Production.
    const factory = await asUser(browser, "factory");
    await open(factory, "/production-orders");
    await expect(factory.getByText(id)).toBeVisible();
    await factory.context().close();

    // So does the client user, whose organization it is.
    const client = await asUser(browser, "client");
    await open(client, "/production-orders");
    await expect(client.getByText(id)).toBeVisible();
    await client.context().close();
  } finally {
    // Deleted, so test orders don't pile up.
    await page.goto(orderPage);
    await expect(page.getByRole("heading", { level: 1, name: id })).toBeVisible();
    page.once("dialog", (confirm) => confirm.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(notice(page)).toContainText(`Deleted order ${id}.`);
  }
});
