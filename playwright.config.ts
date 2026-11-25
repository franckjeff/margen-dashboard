import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Click-through tests of the real app in a real browser (npm run e2e), signed in as the E2E test accounts on
// MARGEN TEST. Never point them at MARGEN PROD: they add and delete records.
//
// Locally the accounts come from .env.e2e and the app's Supabase project from .env.local (both ignored by Git).
// On GitHub Actions they come from the repository's secrets (.github/workflows/e2e.yml).
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  // A test that fails is tried once more; one that passes the second time is reported as flaky.
  retries: process.env.CI ? 1 : 0,
  // The tests share the test accounts and records, so they run one file at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    // On GitHub Actions, each failing test becomes (or adds to) a GitHub issue.
    ...(process.env.GITHUB_ACTIONS ? [["./e2e/github-issues-reporter.ts"] as const] : []),
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Kept for failures only: what the browser showed, step by step.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "sign-in", testMatch: /auth\.setup\.ts/ },
    { name: "app", testMatch: /.*\.spec\.ts/, dependencies: ["sign-in"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
