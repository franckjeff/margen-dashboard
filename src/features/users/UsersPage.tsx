import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSignedIn } from "../../auth/AuthProvider";
import { Dialog } from "../../components/Dialog";
import { SearchBox, useSearch } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { Count, Dash, EmailInput, OrDash, Optional, loadingState } from "../../components/ui";
import { expectRows, invalidate, useDbAction } from "../../data/mutations";
import { useFactories, useOrganizations, useUsers, type User } from "../../data/queries";
import { ROLE_LABELS, type Role } from "../../lib/constants";
import { formatDate, formatDateTime } from "../../lib/format";
import { formValues } from "../../lib/forms";
import { messageOf, supabase, unwrap } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";
import { useConfirm } from "../../components/Confirm";

type NameField = "first_name" | "last_name";
// Kept short: shown next to the user's email on the Users page.
const NAME_LABELS: Record<NameField, string> = { first_name: "First name", last_name: "Last name" };

const notChanged = (user: User) => `${user.email} wasn't changed. You may not have permission.`;
const MIN_PASSWORD = 8;

type NewUser = { email: string; first_name: string; last_name: string; role: Role; factory_id: string | null; organization_id: string | null; password: string };

// Accounts are created by the create-user function on Supabase's servers (supabase/functions/create-user),
// because that needs the project's secret key. It refuses anyone who isn't an admin.
// What the function says it did. not_sent: why the welcome email didn't go. password: the made-up temporary
// password, given only when the email didn't go and the admin didn't type one, so they can pass it on.
type Created = { email: string; emailed: boolean; not_sent?: string; password?: string };

async function createUser(user: NewUser): Promise<Created> {
  const { data, error } = await supabase.functions.invoke("create-user", { body: user });
  if (!error) return data as Created;
  // The function explains what went wrong in its reply, e.g. that the email already has an account.
  const reply = await (error.context as Response | undefined)?.json?.().catch(() => null);
  throw new Error(reply?.error ?? error.message);
}

// How the Users table is ordered: click a column name to sort by it, click again to reverse it.
// Kept while moving between pages, like the access level filter.
type SortColumn = "email" | "last_sign_in_at" | "created_at";
type UserSort = { column: SortColumn; descending: boolean };
const BY_EMAIL: UserSort = { column: "email", descending: false };
// Dates start newest first; the email starts A to Z.
const nextSort = (sort: UserSort, column: SortColumn): UserSort =>
  sort.column === column ? { column, descending: !sort.descending } : { column, descending: column !== "email" };

// The signed-in user comes first, then the rest in the chosen order (by email when equal). Users who never
// signed in come last either way.
function sortUsers(users: User[], { column, descending }: UserSort, me: string): User[] {
  const byEmail = (a: User, b: User) => (a.email ?? "").localeCompare(b.email ?? "");
  const compare = (a: User, b: User) => {
    const x = a[column];
    const y = b[column];
    if (x === y) return byEmail(a, b);
    if (!x) return 1;
    if (!y) return -1;
    return (descending ? -1 : 1) * x.localeCompare(y) || byEmail(a, b);
  };
  return [...users].sort((a, b) => Number(b.id === me) - Number(a.id === me) || compare(a, b));
}

// A column name that sorts the table when clicked, with an arrow showing the current order.
function SortHeader({ label, column, sort, onSort, className }: { label: string; column: SortColumn; sort: UserSort; onSort: (s: UserSort) => void; className?: string }) {
  const active = sort.column === column;
  return (
    <th className={className} aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}>
      <button type="button" className="sort-button" onClick={() => onSort(nextSort(sort, column))}>
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.descending ? "▼" : "▲") : "↕"}
        </span>
      </button>
    </th>
  );
}

type AccountAction = "disable" | "enable" | "delete";

// Disabling, enabling and deleting accounts needs the secret key too, so the manage-user function does it
// (supabase/functions/manage-user). It refuses anyone who isn't an admin, and works only on Factory and Client accounts.
async function manageUser({ user, action }: { user: User; action: AccountAction }) {
  const { error } = await supabase.functions.invoke("manage-user", { body: { user_id: user.id, action } });
  if (!error) return;
  const reply = await (error.context as Response | undefined)?.json?.().catch(() => null);
  throw new Error(reply?.error ?? error.message);
}

// Runs one action on each selected account in turn. Carries on past a failure, then reports every one that failed.
async function manageUsers({ users, action }: { users: User[]; action: AccountAction }) {
  const failed: string[] = [];
  for (const user of users) {
    await manageUser({ user, action }).catch((error: unknown) => failed.push(`${user.email}: ${error instanceof Error ? error.message : String(error)}`));
  }
  if (failed.length) throw new Error(failed.join("; "));
}

const ACTION_VERB: Record<AccountAction, string> = { disable: "disabled", enable: "enabled again", delete: "deleted" };
const who = (users: User[]) => (users.length === 1 ? (users[0].email ?? "1 user") : `${users.length} users`);
const listOf = (users: User[]) => users.map((u) => `  ${u.email}`).join("\n");

// Only Factory and Client accounts can be disabled or deleted, and never your own.
const canManage = (u: User, me: string) => u.id !== me && (u.role === "factory" || u.role === "client");

function AddUserForm({ onDone }: { onDone: () => void }) {
  const factories = useFactories();
  const organizations = useOrganizations();
  const { notify } = useNotice();
  const [role, setRole] = useState<Role>("client");
  const add = useDbAction({
    tables: ["profiles"],
    run: createUser,
    // Said once the function answers: whether the welcome email went.
    success: () => null,
    failure: ({ email }) => `Couldn't add ${email}`,
  });
  return (
    <Dialog title="Add a user" onClose={onDone}>
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          add.mutate(
            {
              email: v.email,
              first_name: v.first_name,
              last_name: v.last_name,
              role,
              factory_id: role === "factory" ? v.factory_id || null : null,
              organization_id: role === "client" ? v.organization_id || null : null,
              password: v.password,
            },
            {
              onSuccess: (result) => {
                const created = result as Created;
                if (created.emailed) {
                  notify("success", `Added ${created.email} and emailed them a welcome with their temporary password. They choose their own when they first sign in.`);
                } else {
                  const password = created.password ? ` Their temporary password is ${created.password}` : " Give them the temporary password you set";
                  notify("error", `Added ${created.email}, but the welcome email wasn't sent: ${created.not_sent}.${password}; they choose their own when they first sign in.`);
                }
                onDone();
              },
            },
          );
        }}
      >
        <label>
          Email
          <EmailInput name="email" required autoFocus autoComplete="off" />
        </label>
        <div className="field-row">
          <label>
            First name
            <input name="first_name" required maxLength={100} autoComplete="off" />
          </label>
          <label>
            Last name
            <input name="last_name" required maxLength={100} autoComplete="off" />
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
              {/* Required: a Client account is always added with its organization. */}
              <select name="organization_id" defaultValue="" required>
                <option value="" disabled>
                  Choose an organization
                </option>
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
              {/* Required: a Factory account is always added with its factory. */}
              <select name="factory_id" defaultValue="" required>
                <option value="" disabled>
                  Choose a factory
                </option>
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
          Leave it empty to have one made up. A welcome email gives them their sign-in email and this temporary password, and
          they choose their own password when they first sign in.
        </p>
        {/* Shown here too: the page's own message sits behind the window. */}
        {add.isError && <p className="notice error">{messageOf(add.error)}</p>}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add user"}
          </button>
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function UsersPage() {
  const ask = useConfirm();
  const users = useUsers();
  const factories = useFactories();
  const organizations = useOrganizations();
  const { userId } = useSignedIn();
  const { notify } = useNotice();
  const { query, setQuery, matches } = useSearch();
  const [failedSaves, setFailedSaves] = useState(0);
  const [adding, setAdding] = useState(false);
  // "" shows every access level.
  const [roleFilter, setRoleFilter] = useUiState<Role | "">("usersRole", "");
  const [sort, setSort] = useUiState<UserSort>("usersSortBy", BY_EMAIL);
  // Your own account is always first; the rest follow the chosen order.
  const all = sortUsers(users.data ?? [], sort, userId);

  const setRole = useDbAction({
    tables: ["profiles"],
    run: async ({ user, role }: { user: User; role: Role }) =>
      expectRows(unwrap(await supabase.from("profiles").update({ role }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, role }) => `${user.email} is now ${ROLE_LABELS[role]}.`,
    failure: ({ user }) => `Couldn't change ${user.email}`,
  });

  // Every user has a first and last name; the first name is how the Dashboard greets them.
  const setName = useDbAction({
    tables: ["profiles"],
    run: async ({ user, field, value }: { user: User; field: NameField; value: string }) =>
      expectRows(unwrap(await supabase.from("profiles").update(field === "first_name" ? { first_name: value } : { last_name: value }).eq("id", user.id).select("id")), notChanged(user)),
    success: ({ user, field, value }) => `${user.email}'s ${NAME_LABELS[field].toLowerCase()} is now ${value}.`,
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

  // Factory and Client accounts ticked in the table, for Disable, Enable and Delete beside Add.
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const manage = useDbAction({
    tables: ["profiles"],
    run: manageUsers,
    success: ({ users, action }) =>
      action === "disable" ? `${who(users)} disabled: they can't sign in and see nothing.` : `${who(users)} ${ACTION_VERB[action]}.`,
    failure: ({ action }) => `Some users weren't ${ACTION_VERB[action]}`,
  });
  const runOn = (users: User[], action: AccountAction) =>
    manage.mutate(
      { users, action },
      {
        // Some may have changed even when others failed.
        onError: () => invalidate(queryClient, "profiles"),
        onSettled: () => setSelectedIds(new Set()),
      },
    );
  const selected = all.filter((u) => selectedIds.has(u.id) && canManage(u, userId));
  const toDisable = selected.filter((u) => !u.disabled_at);
  const toEnable = selected.filter((u) => u.disabled_at);
  const confirmDisable = async () => {
    if (await ask(`Disable ${who(toDisable)}?\n\n${listOf(toDisable)}\n\nThey won't be able to sign in, and lose access to everything straight away. Their accounts, links and history are kept, and you can enable them again later.`))
      runOn(toDisable, "disable");
  };
  const confirmDelete = async () => {
    if (await ask(`Delete ${who(selected)} for good?\n\n${listOf(selected)}\n\nThis can't be undone. Their notes and order history stay, with their name. To stop them signing in for now, disable the accounts instead.`))
      runOn(selected, "delete");
  };
  const toggle = (u: User, on: boolean) =>
    setSelectedIds((ids) => {
      const next = new Set(ids);
      if (on) next.add(u.id);
      else next.delete(u.id);
      return next;
    });

  // The factory or organization the account is linked to, for the roles that have one.
  const linkedName = (u: User) => (u.role === "factory" ? factoryName(u.factory_id) : u.role === "client" ? organizationName(u.organization_id) : "");
  const searchText = (u: User) => `${u.email} ${u.first_name ?? ""} ${u.last_name ?? ""} ${ROLE_LABELS[u.role]} ${linkedName(u)}`.toLowerCase();
  const visible = all.filter((u) => (!roleFilter || u.role === roleFilter) && matches(searchText(u)));
  const countOf = (role: Role) => all.filter((u) => u.role === role).length;
  // The header checkbox ticks every Factory and Client account the filter and search show.
  const selectable = visible.filter((u) => canManage(u, userId));
  const allTicked = selectable.length > 0 && selectable.every((u) => selectedIds.has(u.id));
  const someTicked = selectable.some((u) => selectedIds.has(u.id));
  const nothing = selected.length === 0;

  return (
    <>
      <div className="page-head">
        <h1>
          Users <Count n={all.length} />
        </h1>
        <select className="filter" aria-label="Filter by access level" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")}>
          <option value="">All access levels</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({countOf(value as Role)})
            </option>
          ))}
        </select>
        <SearchBox value={query} onChange={setQuery} placeholder="Search users" />
        <div className="user-actions" role="group" aria-label="Selected users">
          {!nothing && <span className="muted small">{selected.length} selected</span>}
          <button type="button" disabled={manage.isPending || toDisable.length === 0} onClick={confirmDisable}>
            Disable
          </button>
          <button type="button" disabled={manage.isPending || toEnable.length === 0} onClick={() => runOn(toEnable, "enable")}>
            Enable
          </button>
          <button type="button" className="danger" disabled={manage.isPending || nothing} onClick={confirmDelete}>
            Delete
          </button>
        </div>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add
        </button>
      </div>
      {adding && <AddUserForm onDone={() => setAdding(false)} />}
      <section className="card list">
        {loadingState([users]) ?? (
          <>
            <table className="static users-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      type="checkbox"
                      aria-label="Select all Factory and Client users shown"
                      checked={allTicked}
                      ref={(box) => {
                        if (box) box.indeterminate = someTicked && !allTicked;
                      }}
                      disabled={selectable.length === 0}
                      onChange={(e) =>
                        setSelectedIds((ids) => {
                          const next = new Set(ids);
                          for (const u of selectable) {
                            if (e.target.checked) next.add(u.id);
                            else next.delete(u.id);
                          }
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>First name</th>
                  <th>Last name</th>
                  <SortHeader label="Email" column="email" sort={sort} onSort={setSort} />
                  <th>Access level</th>
                  <th>Linked to</th>
                  <th>Status</th>
                  <SortHeader label="Last signed in" column="last_sign_in_at" sort={sort} onSort={setSort} />
                  <SortHeader label="Added" column="created_at" sort={sort} onSort={setSort} className="hide-sm" />
                </tr>
              </thead>
              <tbody>
                {all.map((u) => (
                  <tr key={u.id} hidden={!visible.includes(u)} className={u.disabled_at ? "disabled-user" : undefined}>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        aria-label={`Select ${u.email}`}
                        // Admin accounts, and your own, can't be disabled or deleted.
                        disabled={!canManage(u, userId)}
                        title={canManage(u, userId) ? undefined : u.id === userId ? "You can't disable or delete your own account." : "Admin accounts can't be disabled or deleted."}
                        checked={selectedIds.has(u.id) && canManage(u, userId)}
                        onChange={(e) => toggle(u, e.target.checked)}
                      />
                    </td>
                    {(["first_name", "last_name"] as const).map((field) => (
                      <td key={field}>
                        <input
                          className={`name-input${u[field] ? "" : " missing"}`}
                          // Remounts with the saved name whenever it changes, or when a change fails.
                          key={`${u[field]}-${failedSaves}`}
                          defaultValue={u[field] ?? ""}
                          placeholder={`Add a ${NAME_LABELS[field].toLowerCase()}`}
                          autoComplete="off"
                          maxLength={100}
                          aria-label={`${NAME_LABELS[field]} for ${u.email}`}
                          disabled={setName.isPending && setName.variables?.user.id === u.id}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value === (u[field] ?? "")) return;
                            // A name can be changed but not removed.
                            if (!value) {
                              event.target.value = u[field] ?? "";
                              return notify("error", `${u.email} needs a ${NAME_LABELS[field].toLowerCase()}.`);
                            }
                            setName.mutate({ user: u, field, value }, { onError: () => setFailedSaves((n) => n + 1) });
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      </td>
                    ))}
                    {/* Long addresses are cut short; the whole one shows on hover. */}
                    <td className="email-cell" title={u.email ?? undefined}>
                      <span className="strong">
                        <OrDash>{u.email}</OrDash>
                      </span>
                      {u.id === userId && <span className="muted small"> (you)</span>}
                    </td>
                    <td className="role-cell">
                      <select
                        aria-label={`Access level for ${u.email}`}
                        value={u.role}
                        // You can't change your own level, and the database keeps at least one admin.
                        // A disabled account can't be made an admin: enable it first.
                        disabled={u.id === userId || Boolean(u.disabled_at) || (setRole.isPending && setRole.variables?.user.id === u.id)}
                        onChange={(e) => setRole.mutate({ user: u, role: e.target.value as Role })}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="link-cell">
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
                    <td>
                      {u.disabled_at ? (
                        <span className="badge disabled-badge" title={`Disabled on ${formatDate(u.disabled_at)}`}>
                          Disabled
                        </span>
                      ) : (
                        <span className="badge active-badge">Active</span>
                      )}
                    </td>
                    <td>
                      {u.last_sign_in_at ? (
                        <time dateTime={u.last_sign_in_at} title={formatDateTime(u.last_sign_in_at)}>
                          {formatDate(u.last_sign_in_at)}
                        </time>
                      ) : (
                        <span className="muted">Never</span>
                      )}
                    </td>
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
    </>
  );
}
