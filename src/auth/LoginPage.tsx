import { useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "../components/Layout";
import { messageOf, supabase } from "../lib/supabase";
import { useRecovery, useSession } from "./AuthProvider";
import { changeMyPassword, MIN_PASSWORD } from "./password";
import { PublicHome } from "./PublicHome";


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
    // A disabled account is banned in Supabase Auth, which answers "User is banned".
    setError(error ? (/banned/i.test(error.message) ? "This account has been disabled. Contact MARGEN if you need access again." : error.message) : null);
  }

  // The sign-in form sits on the public home page, beside what MARGEN Customs is about.
  return (
    <PublicHome
      signIn={
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
      }
    />
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

// The form for choosing a new password, on the reset-link page and at a first sign-in.
function NewPasswordForm({ title, intro, button, onSaved, footer }: { title: string; intro: ReactNode; button: string; onSaved: () => void; footer?: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password"));
    if (password !== String(values.get("confirm")))
      return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await changeMyPassword(password);
    } catch (e) {
      setBusy(false);
      return setError(messageOf(e));
    }
    setBusy(false);
    onSaved();
  }

  return (
    <LoginShell>
      <form className="card login-card" onSubmit={save}>
        <h1>{title}</h1>
        <p className="muted small">{intro}</p>
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
          {busy ? "Savingâ€¦" : button}
        </button>
        {footer}
      </form>
    </LoginShell>
  );
}

// Where a password-reset link lands: the person is signed in and chooses a new password.
export function SetPasswordPage() {
  const session = useSession();
  const { finish } = useRecovery();

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

  // Signed in already, so finishing opens the app.
  return <NewPasswordForm title="New password" intro={`Choose a new password for ${session.user.email}.`} button="Save and sign in" onSaved={finish} />;
}

// Shown after signing in with the temporary password from the welcome email (profiles.must_change_password):
// the app opens once they've chosen their own.
export function ChooseOwnPasswordPage({ email, onSaved }: { email: string; onSaved: () => void }) {
  return (
    <NewPasswordForm
      title="Choose your password"
      intro={`Welcome! You signed in to ${email} with a temporary password. Choose your own to continue.`}
      button="Save and continue"
      onSaved={onSaved}
      footer={
        <button type="button" className="link-button login-link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      }
    />
  );
}

// Shown when the account has no profile row, it couldn't be loaded, or an admin disabled it.
export function NoAccess({ email, error, disabled = false }: { email: string; error?: string; disabled?: boolean }) {
  return (
    <LoginShell>
      <div className="card login-card">
        <h1>{disabled ? "Account disabled" : "No access yet"}</h1>
        {error && (
          <p className="notice error">Couldn't load your account: {error}</p>
        )}
        <p className="muted">
          {disabled ? `${email} has been disabled. Contact MARGEN if you need access again.` : `${email} doesn't have an access level. Ask an admin to set one up.`}
        </p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </LoginShell>
  );
}
