import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "../lib/errorLog";
import { messageOf } from "../lib/supabase";

type Props = { children: ReactNode; whole?: boolean; resetOn?: string };

// The safety net: when a page crashes while drawing, it shows a message and a Reload button
// instead of a blank screen, and logs the crash for admins. Around a page, the menu stays usable,
// and a change of resetOn (the page's address) tries the page again. `whole` is the last resort
// around the entire app.
export class ErrorBoundary extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetOn !== this.props.resetOn && this.state.error !== undefined) this.setState({ error: undefined });
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logError("crash", error, info.componentStack ?? undefined);
  }

  render() {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    // A page's code that no longer exists, after a new version of the app went live: reloading fetches the new one.
    const outdated = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(messageOf(error));
    return (
      <section className={`card section crash${this.props.whole ? " crash-whole" : ""}`} role="alert">
        <h1>{outdated ? "A new version of the app is available" : "Something went wrong on this page"}</h1>
        <p className="muted">
          {outdated
            ? "Reload to get it."
            : "The problem has been reported. Reloading usually fixes it; if it keeps happening, tell a MARGEN admin what you were doing."}
        </p>
        <p className="muted small">{messageOf(error)}</p>
        <div className="form-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </section>
    );
  }
}
