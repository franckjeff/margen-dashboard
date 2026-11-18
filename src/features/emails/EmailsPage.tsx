import { Link } from "react-router";
import { SearchBox, useSearch } from "../../components/ListPage";
import { Count, Dash, DateTime, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useEmailSettings, useEmails, type Email, type EmailSettings } from "../../data/queries";
import { plural } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";

// Must match the check constraints on email_outbox.
const KIND_LABELS: Record<string, string> = {
  order_assigned: "Order assigned (to the factory's default contact)",
  order_shipped: "Order shipped (to the client's default contact)",
  order_request: "New order request (to admins)",
  quote_request: "New quote request (to admins)",
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
function SendingMode({ settings }: { settings: EmailSettings | null }) {
  if (!settings) return null;
  const wait = settings.delay_minutes ? ` Order emails wait ${plural(settings.delay_minutes, "minute")} first, so a change undone in time sends nothing.` : "";
  if (settings.mode === "off") {
    return <p className="sending-mode muted">Sending is off: new emails wait here and nothing goes out.</p>;
  }
  if (settings.mode === "redirect") {
    return (
      <p className="sending-mode muted">
        Test mode: every email goes to <strong>{settings.redirect_to}</strong> instead of its recipient, from {settings.from_address}.{wait}
      </p>
    );
  }
  return (
    <p className="sending-mode muted">
      Emails go to their recipients, from {settings.from_address}.{wait}
    </p>
  );
}

const recipient = (e: Email) => e.recipient_name ?? e.recipient_email ?? "nobody";

function About({ email }: { email: Email }) {
  if (email.order) return <Link to={`/customs/${email.order.id}`} className="mono">{email.order.margen_order_id}</Link>;
  if (email.request) return <Link to={`/order-requests/${email.request.id}`}>{email.request.organization_name}</Link>;
  if (email.lead) return <Link to={`/leads/${email.lead.id}`}>{email.lead.organization_name ?? `${email.lead.first_name} ${email.lead.last_name}`}</Link>;
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
    } ${e.lead ? `${e.lead.first_name} ${e.lead.last_name} ${e.lead.organization_name ?? ""}` : ""} ${e.last_error ?? ""}`.toLowerCase();
  const visible = all.filter((e) => (!statusFilter || e.status === statusFilter) && matches(searchText(e)));
  const countOf = (status: string) => all.filter((e) => e.status === status).length;

  return (
    <>
      <div className="page-head">
        <h1>
          Email log <Count n={all.length} />
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
      {!settings.isPending && <SendingMode settings={settings.data ?? null} />}
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
            <p className="empty">No emails yet. They appear here when an order is assigned to a factory, an order ships, or an order request arrives.</p>
          ))}
      </section>
      <p className="muted small hint">
        The app emails a factory's default contact when an order is assigned to the factory, an organization's default contact when
        its order ships, and the admins when an order request arrives. With no default contact, or one without an email address, the
        email shows as Nobody to email. Failed emails are tried again up to 5 times. The latest 500 emails are shown.
      </p>
    </>
  );
}
