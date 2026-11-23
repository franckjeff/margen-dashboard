import { describe, expect, it } from "vitest";
import { emailWarnings } from "./warnings";

const now = Date.parse("2026-11-23T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();
const email = (status: string, hours: number, last_error: string | null = null, attempts = 1) => ({ status, attempts, created_at: hoursAgo(hours), last_error });

describe("emailWarnings", () => {
  it("is empty when every email went out", () => {
    expect(emailWarnings([email("sent", 1), email("cancelled", 2)], now)).toEqual([]);
  });

  it("counts failures in the last 24 hours only", () => {
    expect(emailWarnings([email("failed", 2), email("failed", 23), email("failed", 30)], now)).toEqual([
      { text: "2 emails failed in the last 24 hours.", status: "failed" },
    ]);
  });

  it("counts emails being tried again, not ones waiting for their first try", () => {
    expect(emailWarnings([email("pending", 1, "Timeout", 2), email("pending", 1, null, 0)], now)).toEqual([
      { text: "1 email didn't go out and will be tried again.", status: "pending" },
    ]);
  });

  it("lists the commonest reasons nobody was emailed in the last 30 days", () => {
    const warnings = emailWarnings(
      [
        email("skipped", 5, "Factory B has no default contact."),
        email("skipped", 50, "Factory B has no default contact."),
        email("skipped", 10, "Club A has no default contact."),
        email("skipped", 24 * 40, "Old Club has no default contact."),
      ],
      now,
    );
    expect(warnings.map((w) => w.text)).toEqual([
      "Nobody to email (2 times in the last 30 days): Factory B has no default contact.",
      "Nobody to email (once in the last 30 days): Club A has no default contact.",
    ]);
  });
});
