import { useState } from "react";
import { useSignedIn } from "../../auth/AuthProvider";
import { SearchBox, useSearch } from "../../components/ListPage";
import { Count, Dash, DateTime, OrDash, Optional, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useFactories, useOrganizations, useUsers, type User } from "../../data/queries";
import { ROLE_LABELS, type Role } from "../../lib/constants";
import { formatDate } from "../../lib/format";
import { formValues } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";

const notChanged = (user: User) => `${user.email} wasn't changed. You may not have permission.`;
const MIN_PASSWORD = 8;

type NewUser = { email: string; first_name: string; role: Role; factory_id: string | null; organization_id: string | null; password: string };

// Accounts are created by the create-user function on Supabase's servers (supabase/functions/create-user),
// because that needs the project's secret key. It refuses anyone who isn't an admin.
async function createUser(user: NewUser) {
  const { error } = await supabase.functions.invoke("create-user", { body: user });
  if (!error) return;
  // The function explains what went wrong in its reply, e.g. that the email already has an account.
  const reply = await (error.context as Response | undefined)?.json?.().catch(() => null);
  throw new Error(reply?.error ?? error.message);
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const factories = useFactories();
  const organizations = useOrganizations();
  const [role, setRole] = useState<Role>("client");
  const add = useDbAction({
    tables: ["profiles"],
    run: createUser,
    success: ({ email, password }) =>
      password
        ? `Added ${email}. Give them their password; they can change it with "Forgot your password?".`
        : `Added ${email}. They choose a password with "Forgot your password?" on the sign-in page.`,
    failure: ({ email }) => `Couldn't add ${email}`,
  });
  return (
    <section className="card section">
      <h2>Add a user</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          add.mutate(
            {
              email: v.email,
              first_name: v.first_name,
              role,
              factory_id: role === "factory" ? v.factory_id || null : null,
              organization_id: role === "client" ? v.organization_id || null : null,
              password: v.password,
            },
            { onSuccess: onDone },
          );
        }}
      >
        <div className="field-row">
          <label>
            Email
            <input type="email" name="email" required autoFocus autoComplete="off" />
          </label>
          <label>
            <Optional>First name</Optional>
            <input name="first_name" autoComplete="off" />
          </label>
        </div>
        <div className="field-row">
          <label>
            Access level
            <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {role === "client" && (
            <label>
              Organization
              <select name="organization_id" defaultValue="">
                <option value="">Not linked</option>
                {organizations.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === "factory" && (
            <label>
              Factory
              <select name="factory_id" defaultValue="">
                <option value="">Not linked</option>
                {factories.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label>
          <Optional>Temporary password</Optional>
          <input type="text" name="password" minLength={MIN_PASSWORD} autoComplete="new-password" />
        </label>
        <p className="muted small">
          Leave the password empty and they choose their own with "Forgot your password?" on the sign-in page. If you set one, give it
          to them yourself: the app sends no email when it adds an account.
        </p>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add user"}
          </button>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export function UsersPage() {
  const users = useUsers();
  const factories = useFactories();
  const organizations = useOrganizations();
  const { userId } = useSignedIn();
  const { query, setQuery, matches } = useSearch();
  const [failedSaves, setFailedSaves] = useState(0);
  const [adding, setAdding] = useState(false);
  const all = users.data ?? [];

  const setRole = useDbAction({
    tables: ["profiles"],
    run: async ({ user, role }: { user: User; role: Role }) =>
      expectRows(unwrap(await supabase.from("profiles").update({ role }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, role }) => `${user.email} is now ${ROLE_LABELS[role]}.`,
    failure: ({ user }) => `Couldn't change ${user.email}`,
  });

  // The first name is how the Dashboard greets each person.
  const setFirstName = useDbAction({
    tables: ["profiles"],
    run: async ({ user, first_name }: { user: User; first_name: string | null }) =>
      expectRows(unwrap(await supabase.from("profiles").update({ first_name }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, first_name }) => (first_name ? `${user.email} is now called ${first_name}.` : `Removed ${user.email}'s name.`),
    failure: ({ user }) => `Couldn't change ${user.email}`,
  });

  // A factory account sees only the orders of the factory it's linked to.
  const setFactory = useDbAction({
    tables: ["profiles"],
    run: async ({ user, factory_id }: { user: User; factory_id: string | null }) =>
      expectRows(unwrap(await supabase.from("profiles").update({ factory_id }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, factory_id }) =>
      factory_id
        ? `${user.email} now sees ${factoryName(factory_id)}'s orders.`
        : `${user.email} isn't linked to a factory any more, so they see no orders.`,
    failure: ({ user }) => `Couldn't change ${user.email}`,
  });
  const factoryName = (id: string | null) => factories.data?.find((f) => f.id === id)?.name ?? "";

  // A client account sees only the orders of the organization it's linked to, read only.
  const setOrganization = useDbAction({
    tables: ["profiles"],
    run: async ({ user, organization_id }: { user: User; organization_id: string | null }) =>
      expectRows(unwrap(await supabase.from("profiles").update({ organization_id }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, organization_id }) =>
      organization_id
        ? `${user.email} now sees ${organizationName(organization_id)}'s orders.`
        : `${user.email} isn't linked to an organization any more, so they see no orders.`,
    failure: ({ user }) => `Couldn't change ${user.email}`,
  });
  const organizationName = (id: string | null) => organizations.data?.find((o) => o.id === id)?.name ?? "";

  // The factory or organization the account is linked to, for the roles that have one.
  const linkedName = (u: User) => (u.role === "factory" ? factoryName(u.factory_id) : u.role === "client" ? organizationName(u.organization_id) : "");
  const searchText = (u: User) => `${u.email} ${u.first_name ?? ""} ${ROLE_LABELS[u.role]} ${linkedName(u)}`.toLowerCase();
  const visible = all.filter((u) => matches(searchText(u)));

  return (
    <>
      <div className="page-head">
        <h1>
          Users <Count n={all.length} />
        </h1>
        <SearchBox value={query} onChange={setQuery} placeholder="Search users" />
        {!adding && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            Add user
          </button>
        )}
      </div>
      {adding && <AddUserForm onDone={() => setAdding(false)} />}
      <section className="card list">
        {loadingState([users]) ?? (
          <>
            <table className="static">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>First name</th>
                  <th>Access level</th>
                  <th>Linked to</th>
                  <th>Last signed in</th>
                  <th className="hide-sm">Added</th>
                </tr>
              </thead>
              <tbody>
                {all.map((u) => (
                  <tr key={u.id} hidden={!visible.includes(u)}>
                    <td>
                      <span className="strong">
                        <OrDash>{u.email}</OrDash>
                      </span>
                      {u.id === userId && <span className="muted small"> (you)</span>}
                    </td>
                    <td>
                      <input
                        className="name-input"
                        // Remounts with the saved name whenever it changes, or when a change fails.
                        key={`${u.first_name}-${failedSaves}`}
                        defaultValue={u.first_name ?? ""}
                        placeholder="Add a name"
                        autoComplete="off"
                        aria-label={`First name for ${u.email}`}
                        disabled={setFirstName.isPending && setFirstName.variables?.user.id === u.id}
                        onBlur={(event) => {
                          const first_name = event.target.value.trim() || null;
                          if (first_name !== u.first_name) {
                            setFirstName.mutate({ user: u, first_name }, { onError: () => setFailedSaves((n) => n + 1) });
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="role-cell">
                      <select
                        aria-label={`Access level for ${u.email}`}
                        value={u.role}
                        // You can't change your own level, and the database keeps at least one admin.
                        disabled={u.id === userId || (setRole.isPending && setRole.variables?.user.id === u.id)}
                        onChange={(e) => setRole.mutate({ user: u, role: e.target.value as Role })}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.role === "factory" ? (
                        <select
                          aria-label={`Factory for ${u.email}`}
                          value={u.factory_id ?? ""}
                          disabled={factories.isPending || (setFactory.isPending && setFactory.variables?.user.id === u.id)}
                          onChange={(e) => setFactory.mutate({ user: u, factory_id: e.target.value || null })}
                        >
                          <option value="">Not linked</option>
                          {factories.data?.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      ) : u.role === "client" ? (
                        <select
                          aria-label={`Organization for ${u.email}`}
                          value={u.organization_id ?? ""}
                          disabled={organizations.isPending || (setOrganization.isPending && setOrganization.variables?.user.id === u.id)}
                          onChange={(e) => setOrganization.mutate({ user: u, organization_id: e.target.value || null })}
                        >
                          <option value="">Not linked</option>
                          {organizations.data?.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td>{u.last_sign_in_at ? <DateTime value={u.last_sign_in_at} /> : <span className="muted">Never</span>}</td>
                    <td className="muted hide-sm">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="empty no-match" hidden={visible.length > 0}>
              No matches.
            </p>
          </>
        )}
      </section>
      <p className="muted small hint">
        New users are added with Add user. You can't change your own level, and there must
        always be at least one Admin. The first name is how the Dashboard greets each person. A Factory account sees only the
        orders of the factory it's linked to, and can change only their production status and shipping details. A Client account
        sees only the orders of the organization it's linked to, and can't change anything. A Designer account sees only the
        Dashboard and Designs.
      </p>
    </>
  );
}
