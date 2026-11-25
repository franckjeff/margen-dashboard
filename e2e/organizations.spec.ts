import { expect, notice, open, sessionFile, test, unique } from "./helpers";

test.use({ storageState: sessionFile("admin") });

test("an admin adds an organization in the Add window, then deletes it from the list", async ({ page }) => {
  const name = unique("E2E Org");
  await open(page, "/organizations");

  await page.getByRole("link", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add organization" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Add organization" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(notice(page)).toContainText(`Added ${name}.`);

  await open(page, "/organizations");
  await page.getByRole("searchbox", { name: "Search organizations" }).fill(name);
  await page.getByLabel(`Select ${name}`).check();
  await expect(page.getByText("1 selected")).toBeVisible();
  page.once("dialog", (confirm) => {
    expect(confirm.message()).toContain(`Delete ${name}?`);
    return confirm.accept();
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(notice(page)).toContainText(`Deleted ${name}.`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("an organization with an order still going can't be ticked for deleting", async ({ page }) => {
  // E2E Club always has the client test account linked, so it's never deletable.
  await open(page, "/organizations");
  await page.getByRole("searchbox", { name: "Search organizations" }).fill("E2E Club");
  await expect(page.getByLabel("Select E2E Club")).toBeDisabled();
});
