import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Logo } from "../../components/Layout";
import { Optional } from "../../components/ui";
import { formValues } from "../../lib/forms";
import { supabase } from "../../lib/supabase";

// The public Request a quote page (#/quote): anyone can ask for a quote without signing in.
// It's saved as a lead (Leads page) and every admin gets an email. Orders with items and sizes
// are sent from inside the app, by signed-in clients.
export function QuotePage() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <div className="public-page">
      <header className="public-head">
        <Link to="/" aria-label="MARGEN home">
          <Logo />
        </Link>
        <span className="tagline">Request a quote</span>
        <Link to="/" className="public-back">
          ← Back to MARGEN
        </Link>
      </header>
      <main className="public-main">
        {sentTo ? (
          <section className="card section public-done">
            <h1>Thank you</h1>
            <p>
              We've received your quote request. We'll get back to you at <strong>{sentTo}</strong>.
            </p>
            <button type="button" className="primary" onClick={() => setSentTo(null)}>
              Send another request
            </button>
          </section>
        ) : (
          <QuoteForm onSent={setSentTo} />
        )}
      </main>
    </div>
  );
}

function QuoteForm({ onSent }: { onSent: (email: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    const v = formValues(event);
    setBusy(true);
    // Blank optional fields are sent as "": the database stores them as empty.
    const { error: failed } = await supabase.rpc("submit_quote_request", {
      first_name: v.first_name,
      last_name: v.last_name,
      organization_name: v.organization_name ?? "",
      email: v.email,
      phone: v.phone ?? "",
      country: v.country ?? "",
      message: v.message,
      website: v.website ?? "",
    });
    setBusy(false);
    if (failed) return setError(`Your request wasn't sent: ${failed.message}`);
    onSent(v.email.trim());
  }

  return (
    <form className="stack" onSubmit={send}>
      <div>
        <h1>Request a quote</h1>
        <p className="muted">Tell us about your team and what you have in mind. We'll come back to you with a quote.</p>
      </div>

      <section className="card section stack">
        <h2>Your details</h2>
        <div className="field-row">
          <label>
            First name
            <input name="first_name" required maxLength={100} autoComplete="given-name" />
          </label>
          <label>
            Last name
            <input name="last_name" required maxLength={100} autoComplete="family-name" />
          </label>
        </div>
        <label>
          <Optional>Organization or club</Optional>
          <input name="organization_name" maxLength={200} autoComplete="organization" />
        </label>
        <div className="field-row">
          <label>
            Email
            <input name="email" type="email" required maxLength={320} autoComplete="email" />
          </label>
          <label>
            <Optional>Phone</Optional>
            <input name="phone" type="tel" maxLength={50} autoComplete="tel" />
          </label>
        </div>
        <label>
          <Optional>Country</Optional>
          <input name="country" maxLength={100} autoComplete="country-name" />
        </label>
        {/* A trap for bots: hidden from people and screen readers, so only a bot fills it in. */}
        <label className="trap" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </section>

      <section className="card section stack">
        <h2>What do you need?</h2>
        <label>
          Your message
          <textarea
            name="message"
            required
            rows={6}
            maxLength={5000}
            placeholder="The garments you're thinking of, roughly how many, your colours and any deadline…"
          />
        </label>
      </section>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary public-send" disabled={busy}>
        {busy ? "Sending…" : "Send request"}
      </button>
      <p className="muted small">
        Already a MARGEN client? <Link to="/">Sign in</Link> to send an order with items and sizes. Only signed-in clients can send orders.
      </p>
    </form>
  );
}
