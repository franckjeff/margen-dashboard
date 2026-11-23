import type { Email } from "../../data/queries";
import { plural } from "../../lib/format";

// A problem shown at the top of the Email Admin and Logs page, with the status that lists the emails behind it.
export type EmailWarning = { text: string; status: string };

type Row = Pick<Email, "status" | "attempts" | "created_at" | "last_error">;

const DAY = 24 * 60 * 60 * 1000;

// What's worth an admin's attention in the latest emails: failures in the last day, emails being tried
// again, and the most common reasons emails reached nobody in the last 30 days.
export function emailWarnings(emails: Row[], now = Date.now()): EmailWarning[] {
  const within = (e: Row, days: number) => now - Date.parse(e.created_at) <= days * DAY;
  const warnings: EmailWarning[] = [];

  const failed = emails.filter((e) => e.status === "failed" && within(e, 1)).length;
  if (failed) warnings.push({ text: `${plural(failed, "email")} failed in the last 24 hours.`, status: "failed" });

  const retrying = emails.filter((e) => e.status === "pending" && e.attempts > 0).length;
  if (retrying) warnings.push({ text: `${plural(retrying, "email")} didn't go out and will be tried again.`, status: "pending" });

  const reasons = new Map<string, number>();
  for (const e of emails) {
    if (e.status !== "skipped" || !within(e, 30)) continue;
    const reason = e.last_error ?? "No reason given.";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  [...reasons]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .forEach(([reason, n]) => warnings.push({ text: `Nobody to email (${n === 1 ? "once" : `${n} times`} in the last 30 days): ${reason}`, status: "skipped" }));

  return warnings;
}
