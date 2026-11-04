import { DbError, messageOf, supabase } from "./supabase";

export type ErrorKind = "crash" | "database" | "background";

// One page load reports each error once, and at most this many in total, so a loop can't flood the log.
const MAX_REPORTS = 20;
const reported = new Set<string>();

// Records an error in the app_errors table, which admins see on the Dashboard. It never throws:
// if the report itself fails (offline, say), the error is dropped.
export function logError(kind: ErrorKind, error: unknown, detail?: string) {
  const message = messageOf(error);
  const key = `${kind}:${message}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS) return;
  reported.add(key);
  if (import.meta.env.DEV) console.warn("Logged app error:", kind, error);
  const stack = error instanceof Error ? error.stack : undefined;
  const code = error instanceof DbError && error.code ? `Database error code ${error.code}` : undefined;
  supabase
    .rpc("log_app_error", {
      kind,
      message,
      detail: [detail, code, stack].filter(Boolean).join("\n\n"),
      page: window.location.hash || "#/",
      user_agent: navigator.userAgent,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// Database errors that are the user's to fix, already explained to them on screen: a duplicate
// (23505), a message raised by our own functions (P0001), such as a rate limit or a missing field, or a
// row that wasn't found. These aren't bugs, so they aren't logged.
const EXPECTED_CODES = new Set(["23505", "P0001", "PGRST116"]);
export const isExpected = (error: unknown) => error instanceof DbError && !!error.code && EXPECTED_CODES.has(error.code);

// Errors outside React: a failed promise nobody handled, or a script error.
export function logBackgroundErrors() {
  window.addEventListener("error", (event) => logError("background", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => logError("background", event.reason));
}
