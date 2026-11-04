import { useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "../components/Layout";
import { supabase } from "../lib/supabase";
import { useRecovery, useSession } from "./AuthProvider";

const MIN_PASSWORD = 8;

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="login">
      <div className="login-brand">
        <Logo />
        <p className="tagline">For the Marine Generation</p>
      </div>
      {children}
    </main>
  );
}

export function LoginPage() {
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  return forgot ? (
    <ForgotPassword email={email} onBack={() => setForgot(false)} />
  ) : (
    <SignIn email={email} onEmail={setEmail} onForgot={() => setForgot(true)} />
  );
}

function SignIn({
  email,
  onEmail,
  onForgot,
}: {
  email: string;
  onEmail: (email: string) => void;
  onForgot: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(values.get("email")),
      password: String(values.get("password")),
    });
    // On success the auth listener swaps this page for the app.
    setBusy(false);
    setError(error?.message ?? null);
  }

  return (
    <LoginShell>
      <form className="card login-card" onSubmit={signIn}>
        <h1>Sign in</h1>
        {error && <p className="notice error">{error}</p>}
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          Sign in
        </button>
        <button
          type="button"
          className="link-button login-link"
          onClick={onForgot}
        >
          Forgot your password?
        </button>
      </form>
    </LoginShell>
  );
}

// Emails a link to choose a new password. The link opens this app, signed in, on the page below.
function ForgotPassword({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(
      new FormData(event.currentTarget).get("email"),
    ).trim();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setError(null);
    setSentTo(address);
  }

  return (
    <LoginShell>
      <form className="card login-card" onSubmit={send}>
        <h1>Reset password</h1>
        {sentTo ? (
          <p className="notice success">
            If {sentTo} has an account, we've emailed it a link to choose a new
            password. Open it in this browser within the hour.
          </p>
        ) : (
          <>
            <p className="muted small">
              Enter your email and we'll send you a link to choose a new
              password.
            </p>
            {error && <p className="notice error">{error}</p>}
            <label>
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                defaultValue={email}
                autoFocus
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <button
          type="button"
          className="link-button login-link"
          onClick={onBack}
        >
          Back to sign in
        </button>
      </form>
    </LoginShell>
  );
}

// Where a password-reset link lands: the person is signed in and chooses a new password.
export function SetPasswordPage() {
  const session = useSession();
  const { finish } = useRecovery();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The link didn't sign anyone in: it expired, was already used, or was opened in another browser.
  if (!session) {
    return (
      <LoginShell>
        <div className="card login-card">
          <h1>Link not valid</h1>
          <p className="muted">
            This reset link has expired or was already used, or it was opened in
            a different browser from the one where you asked for it. Ask for a
            new link and open it in the same browser.
          </p>
          <button type="button" className="primary" onClick={finish}>
            Back to sign in
          </button>
        </div>
      </LoginShell>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password"));
    if (password !== String(values.get("confirm")))
      return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    // Signed in already, so this opens the app.
    finish();
  }

  return (
    <LoginShell>
      <form className="card login-card" onSubmit={save}>
        <h1>New password</h1>
        <p className="muted small">
          Choose a new password for {session.user.email}.
        </p>
        {error && <p className="notice error">{error}</p>}
        <label>
          New password
          <input
            type="password"
            name="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            autoFocus
          />
        </label>
        <label>
          Repeat it
          <input
            type="password"
            name="confirm"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
          />
        </label>
        <p className="muted small">At least {MIN_PASSWORD} characters.</p>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    </LoginShell>
  );
}

// Shown when the account has no profile row, or it couldn't be loaded.
export function NoAccess({ email, error }: { email: string; error?: string }) {
  return (
    <LoginShell>
      <div className="card login-card">
        <h1>No access yet</h1>
        {error && (
          <p className="notice error">Couldn't load your account: {error}</p>
        )}
        <p className="muted">
          {email} doesn't have an access level. Ask an admin to set one up.
        </p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </LoginShell>
  );
}
