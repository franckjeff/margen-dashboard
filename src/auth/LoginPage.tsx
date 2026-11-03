import { useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "../components/Layout";
import { supabase } from "../lib/supabase";

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
          <input type="email" name="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          Sign in
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
        {error && <p className="notice error">Couldn't load your account: {error}</p>}
        <p className="muted">{email} doesn't have an access level. Ask an admin to set one up.</p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </LoginShell>
  );
}
