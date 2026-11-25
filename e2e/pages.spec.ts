import { PAGES, visiblePages } from "../src/lib/constants";
import { ROLES, expect, open, sessionFile, test } from "./helpers";

// Every page in each kind of user's menu opens without crashing or browser errors, and the menu shows
// only that user's pages.
for (const role of ROLES) {
  test.describe(`${role} user`, () => {
    test.use({ storageState: sessionFile(role) });

    for (const page of visiblePages(role)) {
      test(`opens ${page.group ? `${page.group} > ` : ""}${page.label}`, async ({ page: browser }) => {
        await open(browser, `/${page.name}`);
        await expect(browser).toHaveURL(new RegExp(`#/${page.name}$`));
      });
    }

    test("is sent home from pages that aren't theirs", async ({ page: browser }) => {
      const mine = new Set(visiblePages(role).map((p) => p.name));
      const others = PAGES.filter((p) => !mine.has(p.name));
      test.skip(others.length === 0, "This user sees every page.");
      for (const other of others) {
        await browser.goto(`/#/${other.name}`);
        await expect(browser).toHaveURL(new RegExp(`#/${visiblePages(role)[0].name}$`));
      }
    });
  });
}
