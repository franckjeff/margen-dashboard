import { useState } from "react";
import { write, type Kind } from "../../../supabase/functions/send-emails/templates";
import { useSignedIn } from "../../auth/AuthProvider";
import { loadingState } from "../../components/ui";
import { useDbAction } from "../../data/mutations";
import { useUsers, type EmailSettings, type User } from "../../data/queries";
import { fullName } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";

// Must match private.admin_email_kinds() in the database.
const ADMIN_KINDS: Record<string, string> = {
  order_request: "Order requests",
  quote_request: "Quote requests",
  athlete_note_added: "Athlete notes",
  order_note_from_factory: "Factory order notes",
};

const adminName = (u: User) => (u.first_name && u.last_name ? fullName({ first_name: u.first_name, last_name: u.last_name }) : (u.first_name ?? u.email));

// Which admins get which admin emails. Each admin can be chosen for each kind on its own.
export function AdminEmails({ settings }: { settings: EmailSettings }) {
  const users = useUsers();
  const admins = (users.data ?? []).filter((u) => u.role === "admin");

  const choose = useDbAction({
    tables: ["profiles", "email_outbox"],
    run: async ({ user, kind, enabled }: { user: User; kind: string; enabled: boolean }) =>
      unwrap(await supabase.rpc("set_admin_email", { user_id: user.id, kind, enabled })),
    success: ({ user, kind, enabled }) =>
      enabled
        ? `${adminName(user)} now gets "${ADMIN_KINDS[kind]}" emails.`
        : `${adminName(user)} no longer gets "${ADMIN_KINDS[kind]}" emails. Any still waiting for them were cancelled.`,
    failure: () => "Couldn't change who gets admin emails",
  });

  return (
    <section className="card section email-controls">
      <h2>Who gets admin emails</h2>
      {loadingState([users]) ?? (
        <div className="table-scroll">
          <table className="static email-choices">
            <thead>
              <tr>
                <th>Admin</th>
                {Object.entries(ADMIN_KINDS).map(([kind, label]) => (
                  <th key={kind}>
                    {label}
                    {settings.disabled_kinds.includes(kind) && <div className="muted small">Off for everyone</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => (
                <tr key={u.id}>
                  <td>
                    {adminName(u)}
                    <div className="muted small">{u.email}</div>
                  </td>
                  {Object.entries(ADMIN_KINDS).map(([kind, label]) => {
                    const enabled = !u.muted_email_kinds.includes(kind);
                    return (
                      <td key={kind}>
                        <input
                          type="checkbox"
                          aria-label={`${adminName(u)} gets ${label} emails`}
                          checked={enabled}
                          disabled={choose.isPending}
                          onChange={() => choose.mutate({ user: u, kind, enabled: !enabled })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">An admin who makes a change to an athlete note never gets an email about it.</p>
    </section>
  );
}

// The sender address and how long order emails wait before they go out.
export function SenderSettings({ settings }: { settings: EmailSettings }) {
  const save = useDbAction({
    tables: ["email_settings"],
    run: async (v: { from_address: string; delay_minutes: number }) => unwrap(await supabase.rpc("set_email_sender", v)),
    success: () => "Saved the sender and wait. New emails use them.",
    failure: () => "Couldn't save the sender",
  });

  return (
    <section className="card section email-controls">
      <h2>Sender and wait</h2>
      <form
        // Starts again from the saved values whenever they change.
        key={`${settings.from_address}|${settings.delay_minutes}`}
        className="email-sender"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          save.mutate({ from_address: String(form.get("from_address")).trim(), delay_minutes: Number(form.get("delay_minutes")) });
        }}
      >
        <label>
          Sender
          <input name="from_address" required maxLength={200} defaultValue={settings.from_address} autoComplete="off" />
        </label>
        <label>
          Order emails wait (minutes)
          <input name="delay_minutes" type="number" required min={0} max={60} step={1} defaultValue={settings.delay_minutes} />
        </label>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="muted small">
        Write the sender as <span className="mono">Name &lt;address@domain&gt;</span>. Its domain must be verified in Resend, or
        nothing will be delivered. The wait, from 0 to 60 minutes, gives time to undo an order change before its email goes out;
        emails already waiting keep theirs.
      </p>
    </section>
  );
}

// Each template written with made-up details, exactly as the send-emails function writes it.
export function TemplatePreview({ kinds }: { kinds: Record<string, string> }) {
  const { firstName } = useSignedIn();
  const [kind, setKind] = useState(Object.keys(kinds)[0] as Kind);
  const message = write(
    { kind, sample: true, details: { first_name: firstName }, order_id: null, order_request_id: null, lead_id: null },
    window.location.origin,
  );

  return (
    <section className="card section email-controls">
      <div className="section-title">
        <h2>Preview</h2>
        <select aria-label="Email to preview" className="filter" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {Object.entries(kinds).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p>
        <span className="muted">Subject:</span> <strong>{message.subject}</strong>
      </p>
      {/* No scripts or links run inside: the email is shown, not opened. */}
      <iframe className="email-preview" title="Email preview" sandbox="" srcDoc={message.html} />
    </section>
  );
}
