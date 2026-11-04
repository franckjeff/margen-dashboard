import { Count, DateTime, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useAppErrors, type AppError } from "../../data/queries";
import { ROLE_LABELS } from "../../lib/constants";
import { plural } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";

const KIND_LABELS: Record<string, string> = { crash: "Page crashed", database: "Database", background: "Background" };
const KIND_TONES: Record<string, string> = { crash: "tone-warn", database: "tone-accent", background: "tone-muted" };

const who = (e: AppError) =>
  e.user_email ? `${e.user_email}${e.user_role ? ` (${ROLE_LABELS[e.user_role as keyof typeof ROLE_LABELS] ?? e.user_role})` : ""}` : "Not signed in";

// Admins only: errors users hit in the app, logged by the safety net, most recent first. The same
// error for the same person on the same page is one entry with a count. Entries go after 90 days.
export function AppErrors() {
  const errors = useAppErrors();
  const clear = useDbAction({
    tables: ["app_errors"],
    run: async (id?: string) => {
      const query = supabase.from("app_errors").delete();
      const rows = unwrap(await (id ? query.eq("id", id) : query.not("id", "is", null)).select("id"));
      expectRows(rows, "Nothing was cleared. You may not have permission.");
    },
    success: (id) => (id ? null : "Cleared all app errors."),
    failure: (id) => (id ? "Couldn't clear the error" : "Couldn't clear the app errors"),
  });

  const waiting = loadingState([errors]);
  const all = errors.data ?? [];

  return (
    <section className="card section app-errors">
      <div className="section-title">
        <h2>
          App errors <Count n={all.length} />
        </h2>
        {all.length > 0 && (
          <button
            type="button"
            className="ghost small"
            disabled={clear.isPending}
            onClick={() => {
              if (confirm(`Clear all ${plural(all.length, "app error")}? This can't be undone.`)) clear.mutate(undefined);
            }}
          >
            Clear all
          </button>
        )}
      </div>
      {waiting ??
        (all.length ? (
          <ol className="notes-list">
            {all.map((e) => (
              <li key={e.id} className={`note app-error kind-${e.kind}`}>
                <div className="note-meta">
                  <span className={`status ${KIND_TONES[e.kind] ?? ""}`}>{KIND_LABELS[e.kind] ?? e.kind}</span>
                  <DateTime value={e.last_seen_at} />
                  {e.count > 1 && <span>{plural(e.count, "time")}</span>}
                  <span>{who(e)}</span>
                  {e.page && <a href={e.page}>{e.page}</a>}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Clear this error"
                    title="Clear"
                    disabled={clear.isPending}
                    onClick={() => clear.mutate(e.id)}
                  >
                    ×
                  </button>
                </div>
                <p className="note-body">{e.message}</p>
                {(e.detail || e.user_agent) && (
                  <details>
                    <summary className="muted small">Details</summary>
                    {e.count > 1 && (
                      <p className="muted small">
                        First seen <DateTime value={e.created_at} />
                      </p>
                    )}
                    {e.user_agent && <p className="muted small">{e.user_agent}</p>}
                    {e.detail && <pre className="error-detail">{e.detail}</pre>}
                  </details>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">No errors in the last 90 days. Problems users run into in the app appear here.</p>
        ))}
    </section>
  );
}
