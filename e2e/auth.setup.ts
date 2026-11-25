import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { ROLES, account, sessionFile } from "./helpers";

// Signs in once as each test account through the sign-in form, and saves the session for the tests.
mkdirSync("e2e/.auth", { recursive: true });

for (const role of ROLES) {
  setup(`sign in as the ${role} test account`, async ({ page }) => {
    const { email, password } = account(role);
    await page.goto("/");
    // The public home page has other Sign in buttons; this is the form's.
    const form = page.locator("form.login-card");
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Password").fill(password);
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
    await expect(page.locator(".user-email")).toHaveText(email);
    await page.context().storageState({ path: sessionFile(role) });
  });
}
