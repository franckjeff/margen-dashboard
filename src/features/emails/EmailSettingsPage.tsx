import { useState } from "react";
import { loadingState } from "../../components/ui";
import { useDbAction } from "../../data/mutations";
import { useEmailSettings, type EmailSettings } from "../../data/queries";
import { plural } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";
import { AdminEmails, SenderSettings, TemplatePreview } from "./EmailAdmin";
import { KIND_LABELS } from "./kinds";

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

// Admins only: how the app sends its emails. The emails themselves are listed on Email Logs (EmailsPage).
export function EmailSettingsPage() {
  const settings = useEmailSettings();
  return (
    <>
      <div className="page-head">
        <h1>Email Settings</h1>
      </div>
      {loadingState([settings]) ??
        (settings.data && (
          <div className="email-admin">
            <SendingControls settings={settings.data} />
            <SenderSettings settings={settings.data} />
            <AdminEmails settings={settings.data} />
            <TemplatePreview kinds={KIND_LABELS} />
          </div>
        ))}
    </>
  );
}
