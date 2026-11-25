import { expect, test as base, type Page } from "@playwright/test";

export type Role = "admin" | "factory" | "client";
export const ROLES: Role[] = ["admin", "factory", "client"];

// Where each test account's signed-in session is saved by auth.setup.ts (ignored by Git).
export const sessionFile = (role: Role) => `e2e/.auth/${role}.json`;

export function account(role: Role) {
  const email = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];
  if (!email || !password) throw new Error(`Set E2E_${role.toUpperCase()}_EMAIL and _PASSWORD (in .env.e2e, or the GitHub secrets).`);
  return { email, password };
}

// The records the test accounts are linked to on MARGEN TEST.
export const E2E_FACTORY = "E2E Factory";
export const E2E_CLUB = "E2E Club";

// A name no other test run uses, so leftovers from a failed run never clash.
export const unique = (prefix: string) => `${prefix} ${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

// Every test fails on a crash in the page or an error in the browser console, not only on what it checks.
export const test = base.extend<{ watchErrors: void }>({
  watchErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`Page error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`Console error: ${message.text()}`);
      });
      await use();
      expect(errors, "Errors in the browser while the test ran").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// Opens a page of the app (its routes are after #) and waits for its heading.
export async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator("main h1").first()).toBeVisible();
  // The crash screen's heading (the user guide quotes the same words in its text).
  await expect(page.getByRole("heading", { name: "Something went wrong on this page" })).toHaveCount(0);
}

// The green or red message at the top of the page after a change.
export const notice = (page: Page) => page.locator(".notice").first();
