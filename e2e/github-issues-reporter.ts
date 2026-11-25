import type { Reporter, Suite, TestCase } from "@playwright/test/reporter";

// Turns the click-through tests' results into GitHub issues, on GitHub Actions only (playwright.config.ts):
//   * a test that fails opens an issue labelled "e2e" with what went wrong and a link to the run, whose
//     "playwright-report" download has the screenshots, video and step-by-step trace;
//   * if that test already has an open issue, the failure is added to it as a comment instead;
//   * when a test with an open issue passes again, the issue says so and is closed.
// It uses the workflow's own GITHUB_TOKEN, so nothing else needs setting up.

const LABEL = "e2e";
const api = "https://api.github.com";

// Terminal colour codes don't belong in an issue.
const COLOUR_CODE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const plain = (text: string) => text.replace(COLOUR_CODE, "");
// The test file, its groups and its name, e.g. "E2E: pages.spec.ts › admin user › opens Dashboard" (without the project).
const titleOf = (test: TestCase) => `E2E: ${test.titlePath().filter(Boolean).slice(1).join(" › ")}`;

type Issue = { number: number; title: string; pull_request?: unknown };

export default class GitHubIssuesReporter implements Reporter {
  private suite?: Suite;

  onBegin(_: unknown, suite: Suite) {
    this.suite = suite;
  }

  async onEnd() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo || !this.suite) return;
    const run = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${api}/repos/${repo}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${method} ${path}: ${await response.text()}`);
      return response.json();
    };

    try {
      const open = ((await call(`/issues?labels=${LABEL}&state=open&per_page=100`)) as Issue[]).filter((i) => !i.pull_request);
      const issueFor = (test: TestCase) => open.find((i) => i.title === titleOf(test));

      for (const test of this.suite.allTests()) {
        const outcome = test.outcome();
        const existing = issueFor(test);
        if (outcome === "unexpected") {
          const last = test.results[test.results.length - 1];
          const error = plain(last?.errors.map((e) => e.message ?? e.value ?? "").join("\n\n") || "No error message.");
          const where = `${test.location.file.replace(/^.*[\\/]e2e[\\/]/, "e2e/")}:${test.location.line}`;
          const details = [
            `**Test:** ${titleOf(test).replace(/^E2E: /, "")} (\`${where}\`)`,
            `**Run:** ${run} (download **playwright-report** there for the screenshots, video and trace)`,
            `**Commit:** ${process.env.GITHUB_SHA?.slice(0, 7) ?? "unknown"}`,
            "",
            "```",
            error.slice(0, 6000),
            "```",
          ].join("\n");
          if (existing) {
            await call(`/issues/${existing.number}/comments`, "POST", { body: `Failed again.\n\n${details}` });
          } else {
            await call("/issues", "POST", { title: titleOf(test), labels: [LABEL], body: `A click-through test failed on MARGEN TEST.\n\n${details}` });
          }
        } else if ((outcome === "expected" || outcome === "flaky") && existing) {
          await call(`/issues/${existing.number}/comments`, "POST", { body: `Passing again in ${run}.` });
          await call(`/issues/${existing.number}`, "PATCH", { state: "closed" });
        }
      }
    } catch (error) {
      // A problem reaching GitHub mustn't hide the test results themselves.
      console.error(`Couldn't update the GitHub issues: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
