import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { useNotice } from "../../components/Notice";
import { messageOf, supabase } from "../../lib/supabase";

const MIN_PASSWORD = 8;

// Every signed-in user changes their own password here. Linked from the menu, beside Sign out.
export function AccountPage() {
  const { email } = useSignedIn();
  const { notify } = useNotice();
  const navigate = useNavigate();

  const change = useMutation({
    mutationFn: async ({ current, password }: { current: string; password: string }) => {
      // Asking for the current password first means someone using a computer left signed in can't take over the account.
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error("Your current password isn't right.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    // Back to the Dashboard (every role has one), with the message kept across that navigation.
    onSuccess: () => {
      notify("success", "Your password has been reset. Use the new one next time you sign in.", { keep: true });
      navigate("/dashboard");
    },
    onError: (error) => notify("error", `Couldn't change your password: ${messageOf(error)}`),
  });

  return (
    <>
      <div className="page-head">
        <div className="title-block">
          <h1>Change password</h1>
          <p className="muted">{email}</p>
        </div>
      </div>
      <section className="card section">
        <form
          className="stack account-form"
          onSubmit={(event) => {
            event.preventDefault();
            // Read as typed: unlike formValues, no trimming, since a password may start or end with a space.
            const v = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]));
            if (v.password !== v.confirm) return notify("error", "The two new passwords don't match.");
            if (v.password === v.current) return notify("error", "The new password is the same as the current one.");
            change.mutate({ current: v.current, password: v.password });
          }}
        >
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
          <label>
            Current password
            <input type="password" name="current" required autoComplete="current-password" />
          </label>
          <label>
            New password
            <input type="password" name="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </label>
          <label>
            Repeat the new password
            <input type="password" name="confirm" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </label>
          <p className="muted small">At least {MIN_PASSWORD} characters.</p>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={change.isPending}>
              {change.isPending ? "Saving…" : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
