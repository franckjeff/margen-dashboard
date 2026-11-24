import { useState } from "react";
import { Link } from "react-router";
import { SearchBox, useSearch } from "../../components/ListPage";
import { Count, Dash, DateTime, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useEmailSettings, useEmails, type Email, type EmailSettings } from "../../data/queries";
import { plural } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";
import { AdminEmails, SenderSettings, TemplatePreview } from "./EmailAdmin";
import { emailWarnings } from "./warnings";

// Must match the check constraints on email_outbox, and private.email_kinds() in the database.
const KIND_LABELS: Record<string, string> = {
  order_assigned: "Order assigned (to the factory's default contact)",
  order_shipped: "Order shipped (to the client's default contact)",
  order_request: "New order request (to admins)",
  quote_request: "New quote request (to admins)",
  athlete_note_added: "Athlete note added (to admins)",
  order_note_from_factory: "Order note from the factory (to admins)",
  order_note_from_admin: "Order note from MARGEN (to the factory's default contact)",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Nobody to email",
};
const STATUS_TONES: Record<string, string> = {
  pending: "tone-accent",
  sending: "tone-accent",
  sent: "tone-success",
  failed: "tone-warn",
  cancelled: "tone-muted",
  skipped: "tone-warn",
};

// What the database is set to do with emails on this project.
function SendingMode({ settings }: { settings: EmailSettings }) {
  const wait = settings.delay_minutes ? ` Order emails wait ${plural(settings.delay_minutes, "minute")} first, so a change undone in time sends nothing.` : "";
  if (settings.mode === "off") {
    return <p className="muted">Sending is off on this project: new emails wait here and nothing goes out.</p>;
  }
  if (settings.mode === "redirect") {
    return (
      <p className="muted">
        Test mode: every email goes to <strong>{settings.redirect_to}</strong> instead of its recipient, from {settings.from_address}.{wait}
      </p>
    );
  }
  return (
    <p className="muted">
      Emails go to their recipients, from {settings.from_address}.{wait}
    </p>
  );
}

// Admins pause all sending, turn each kind of email on or off, and send themselves samples.
// The database functions check that whoever calls them is an admin.
function SendingControls({ settings }: { settings: EmailSettings }) {
  const [sampleKind, setSampleKind] = useState(Object.keys(KIND_LABELS)[0]);

  const pause = useDbAction({
    tables: ["email_settings", "email_outbox"],
    run: async (paused: boolean) => unwrap(await supabase.rpc("set_email_sending_paused", { paused })),
    success: (paused) => (paused ? "Sending is paused. Emails wait here until you resume." : "Sending has resumed. Waiting emails go out within a minute."),
    failure: (paused) => (paused ? "Couldn't pause sending" : "Couldn't resume sending"),
  });

  const toggle = useDbAction({
    tables: ["email_settings", "email_outbox"],
    run: async ({ kind, enabled }: { kind: string; enabled: boolean }) => unwrap(await supabase.rpc("set_email_kind_enabled", { kind, enabled })),
    success: ({ kind, enabled }) =>
      enabled ? `"${KIND_LABELS[kind]}" emails are on.` : `"${KIND_LABELS[kind]}" emails are off. Any still waiting were cancelled.`,
    failure: () => "Couldn't change which emails are sent",
  });

  const sample = useDbAction({
    tables: ["email_outbox"],
    run: async (kind: string) => unwrap(await supabase.rpc("send_sample_email", { kind })),
    success: () => {
      const address = settings.mode === "redirect" ? settings.redirect_to : "your email address";
      const when = settings.paused || settings.mode === "off" ? "It will go out when sending is on." : "It goes out within a minute.";
      return `A sample is on its way to ${address}. ${when}`;
    },
    failure: () => "Couldn't send the sample",
  });

  return (
    <section className="card section email-controls">
      <div className="section-title">
        <h2>Sending</h2>
        <button
          type="button"
          className={settings.paused ? "primary" : ""}
          disabled={pause.isPending}
          onClick={() => pause.mutate(!settings.paused)}
        >
          {settings.paused ? "Resume sending" : "Pause all sending"}
        </button>
      </div>
      {settings.paused ? (
        <p className="notice error">
          <span>
            <strong>Sending is paused.</strong> New emails wait here and go out when you resume.
          </span>
        </p>
      ) : (
        <SendingMode settings={settings} />
      )}

      <fieldset className="email-kinds">
        <legend>Emails the app sends</legend>
        {Object.entries(KIND_LABELS).map(([kind, label]) => {
          const enabled = !settings.disabled_kinds.includes(kind);
          return (
            <label key={kind} className="check">
              <input
                type="checkbox"
                checked={enabled}
                disabled={toggle.isPending}
                onChange={() => toggle.mutate({ kind, enabled: !enabled })}
              />
              {label}
              {!enabled && <span className="muted small"> (off: logged as cancelled, not sent)</span>}
            </label>
          );
        })}
      </fieldset>

      <form
        className="email-sample"
        onSubmit={(event) => {
          event.preventDefault();
          sample.mutate(sampleKind);
        }}
      >
        <label>
          Send yourself a sample
          <select value={sampleKind} onChange={(e) => setSampleKind(e.target.value)}>
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={sample.isPending}>
          {sample.isPending ? "Sending…" : "Send me a sample"}
        </button>
      </form>
      <p className="muted small">Samples use made-up details and go to your own address, even when that kind of email is off.</p>
    </section>
  );
}

const recipient = (e: Email) => e.recipient_name ?? e.recipient_email ?? "nobody";

function About({ email }: { email: Email }) {
  if (email.order) return <Link to={`/customs/${email.order.id}`} className="mono">{email.order.margen_order_id}</Link>;
  if (email.request) return <Link to={`/order-requests/${email.request.id}`}>{email.request.organization_name}</Link>;
  if (email.lead) return <Link to={`/leads/${email.lead.id}`}>{email.lead.organization_name ?? `${email.lead.first_name} ${email.lead.last_name}`}</Link>;
  if (email.sample) return <span className="muted">Sample</span>;
  if (email.note?.order) return <Link to={`/customs/${email.note.order.id}`} className="mono">{email.note.order.margen_order_id}</Link>;
  if (email.note?.athlete) return <Link to={`/athletes/${email.note.athlete.id}`}>{`${email.note.athlete.first_name} ${email.note.athlete.last_name}`}</Link>;
  return <span className="muted">Deleted</span>;
}

// Admins only: every email the app sends, newest first. Emails are queued by the database when
// something happens, and sent by the send-emails function (see supabase/migrations/*_email_outbox.sql).
export function EmailsPage() {
  const emails = useEmails();
  const settings = useEmailSettings();
  const { query, setQuery, matches } = useSearch();
  // "" shows every status.
  const [statusFilter, setStatusFilter] = useUiState<string>("emailsStatus", "");
  const all = emails.data ?? [];

  const change = useDbAction({
    tables: ["email_outbox"],
    run: async ({ email, retry }: { email: Email; retry: boolean }) =>
      expectRows(
        unwrap(
          await supabase
            .from("email_outbox")
            .update(
              retry
                ? { status: "pending", attempts: 0, send_after: new Date().toISOString(), last_error: null }
                : { status: "cancelled", last_error: "Cancelled by an admin." },
            )
            .eq("id", email.id)
            .select("id"),
        ),
        "The email wasn't changed. You may not have permission.",
      ),
    success: ({ email, retry }) => (retry ? `The email to ${recipient(email)} will be sent again.` : `Cancelled the email to ${recipient(email)}.`),
    failure: ({ retry }) => (retry ? "Couldn't send the email again" : "Couldn't cancel the email"),
  });

  const searchText = (e: Email) =>
    `${e.recipient_name ?? ""} ${e.recipient_email ?? ""} ${KIND_LABELS[e.kind] ?? e.kind} ${STATUS_LABELS[e.status] ?? e.status} ${e.order?.margen_order_id ?? ""} ${
      e.request?.organization_name ?? ""
    } ${e.lead ? `${e.lead.first_name} ${e.lead.last_name} ${e.lead.organization_name ?? ""}` : ""} ${
      e.note?.athlete ? `${e.note.athlete.first_name} ${e.note.athlete.last_name}` : ""
    } ${e.note?.order?.margen_order_id ?? ""} ${e.last_error ?? ""}`.toLowerCase();
  const visible = all.filter((e) => (!statusFilter || e.status === statusFilter) && matches(searchText(e)));
  const countOf = (status: string) => all.filter((e) => e.status === status).length;
  const warnings = emailWarnings(all);

  return (
    <>
      <div className="page-head">
        <h1>
          Email Admin and Logs <Count n={all.length} />
        </h1>
        <select className="filter" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({countOf(value)})
            </option>
          ))}
        </select>
        <SearchBox value={query} onChange={setQuery} placeholder="Search emails" />
      </div>
      {warnings.length > 0 && (
        <section className="notice error email-warnings" role="status">
          <ul>
            {warnings.map((w) => (
              <li key={w.text}>
                {w.text}{" "}
                {statusFilter !== w.status && (
                  <button type="button" className="ghost small" onClick={() => setStatusFilter(w.status)}>
                    Show them
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {settings.data && (
        <div className="email-admin">
          <SendingControls settings={settings.data} />
          <SenderSettings settings={settings.data} />
          <AdminEmails settings={settings.data} />
          <TemplatePreview kinds={KIND_LABELS} />
        </div>
      )}
      <h2 className="email-log-title">Log</h2>
      <section className="card list">
        {loadingState([emails]) ??
          (all.length ? (
            <>
              <table className="static">
                <thead>
                  <tr>
                    <th>Queued</th>
                    <th>Email</th>
                    <th>About</th>
                    <th>To</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id}>
                      <td className="muted">
                        <DateTime value={e.created_at} />
                      </td>
                      <td>{KIND_LABELS[e.kind] ?? e.kind}</td>
                      <td>
                        <About email={e} />
                      </td>
                      <td>
                        {e.recipient_name ?? <Dash />}
                        {e.recipient_email && <div className="muted small">{e.recipient_email}</div>}
                      </td>
                      <td>
                        <span className={`status ${STATUS_TONES[e.status] ?? ""}`}>{STATUS_LABELS[e.status] ?? e.status}</span>
                        {e.status === "sent" && e.sent_at && (
                          <div className="muted small">
                            <DateTime value={e.sent_at} />
                          </div>
                        )}
                        {e.status === "pending" && (
                          <div className="muted small">
                            {e.attempts > 0 && `Attempt ${e.attempts + 1}, `}after <DateTime value={e.send_after} />
                          </div>
                        )}
                        {e.last_error && e.status !== "sent" && <div className="muted small">{e.last_error}</div>}
                      </td>
                      <td className="row-actions">
                        {(e.status === "pending" || e.status === "failed") && (
                          <button type="button" className="ghost small" disabled={change.isPending} onClick={() => change.mutate({ email: e, retry: false })}>
                            Cancel
                          </button>
                        )}
                        {(e.status === "failed" || e.status === "cancelled") && (
                          <button type="button" className="ghost small" disabled={change.isPending} onClick={() => change.mutate({ email: e, retry: true })}>
                            Send again
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="empty no-match" hidden={visible.length > 0}>
                No matches.
              </p>
            </>
          ) : (
            <p className="empty">No emails yet. They appear here when an order is assigned to a factory, an order ships, an order or quote request arrives, an athlete note is added, or a note is added to an order.</p>
          ))}
      </section>
      <p className="muted small hint">
        The app emails a factory's default contact when an order is assigned to the factory, an organization's default contact when
        its order ships, and the admins when an order or quote request arrives or an athlete note is added (except the admin
        who did it). A note on an order from its factory emails the admins; one from an admin emails the factory's default contact. With no default contact, or one without an email address, the
        email shows as Nobody to email. Failed emails are tried again up to 5 times. The latest 500 emails are shown.
      </p>
    </>
  );
}
