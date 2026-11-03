import { useState } from "react";
import { useSignedIn } from "../../auth/AuthProvider";
import { SearchBox, useSearch } from "../../components/ListPage";
import { Count, Dash, DateTime, OrDash, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useFactories, useUsers, type User } from "../../data/queries";
import { ROLE_LABELS, type Role } from "../../lib/constants";
import { formatDate } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";

const notChanged = (user: User) => `${user.email} wasn't changed. You may not have permission.`;

export function UsersPage() {
  const users = useUsers();
  const factories = useFactories();
  const { userId } = useSignedIn();
  const { query, setQuery, matches } = useSearch();
  const [failedSaves, setFailedSaves] = useState(0);
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

  const searchText = (u: User) => `${u.email} ${u.first_name ?? ""} ${ROLE_LABELS[u.role]} ${u.role === "factory" ? factoryName(u.factory_id) : ""}`.toLowerCase();
  const visible = all.filter((u) => matches(searchText(u)));

  return (
    <>
      <div className="page-head">
        <h1>
          Users <Count n={all.length} />
        </h1>
        <SearchBox value={query} onChange={setQuery} placeholder="Search users" />
      </div>
      <section className="card list">
        {loadingState([users]) ?? (
          <>
            <table className="static">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>First name</th>
                  <th>Access level</th>
                  <th>Factory</th>
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
        New users are added in Supabase (Authentication → Users) and start as Client. You can't change your own level, and there must
        always be at least one Admin. The first name is how the Dashboard greets each person. A Factory account sees only the
        orders of the factory it's linked to, and can't change anything.
      </p>
    </>
  );
}
