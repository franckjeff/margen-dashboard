import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const app = document.getElementById("app");

const state = {
  session: undefined, // undefined = still checking, null = signed out
  organizations: [],
  contacts: [],
  athletes: [],
  leads: [],
  users: [], // profiles, admins only
  loaded: false,
  role: undefined, // undefined = still loading, null = no profile, else "admin" | "factory" | "client"
  notice: null, // { type: "error" | "success", text }
  keepNotice: false,
};

// ---------- helpers ----------

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const fullName = (c) => `${c.first_name} ${c.last_name}`;

const ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "state", "postal_code", "country"];
const contactLocation = (c) => [c.city, c.country].filter(Boolean).join(", ");
// e.g. ["2909 Kalakaua Ave", "Honolulu, Hawaii 96815", "United States"]
const addressLines = (c) =>
  [
    c.address_line1,
    c.address_line2,
    [[c.city, c.state].filter(Boolean).join(", "), c.postal_code].filter(Boolean).join(" "),
    c.country,
  ].filter(Boolean);
const place = (o) => [o.state, o.country].filter(Boolean).join(", ");
const byName = (a, b) => a.name.localeCompare(b.name);
const byPerson = (a, b) =>
  a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
const dash = '<span class="muted">—</span>';
const formatDate = (date) =>
  new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const ROLE_LABELS = { admin: "Admin", factory: "Factory", client: "Client" };

// Must match the check constraint on leads.status.
const LEAD_STATUSES = { new: "New", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost" };
const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"];
const statusBadge = (status) => `<span class="status status-${status}">${LEAD_STATUSES[status]}</span>`;

// Menu order, and which roles see each page. The first visible page is the home page.
// Hiding a page here is only cosmetic: the database's access rules are what protect the data.
const PAGES = [
  { name: "dashboard", label: "Dashboard", roles: ["admin", "factory", "client"] },
  { name: "customs", label: "Customs", roles: ["admin"] },
  { name: "shopify", label: "Shopify", roles: ["admin"] },
  { name: "athletes", label: "Athletes", roles: ["admin"] },
  { name: "leads", label: "Leads", roles: ["admin"] },
  { name: "organizations", label: "Organizations", roles: ["admin"] },
  { name: "contacts", label: "Contacts", roles: ["admin"] },
  { name: "users", label: "Users", roles: ["admin"] },
];

const visiblePages = () => PAGES.filter((p) => p.roles.includes(state.role));

// Hash routes: #/dashboard, #/customs, #/shopify, plus #/organizations,
// #/organizations/new, #/organizations/<id>, #/organizations/<id>/edit, and the same for
// athletes, leads and contacts.
function route() {
  const [, page, id = null, mode = null] = location.hash.split("/");
  const pages = visiblePages();
  const allowed = pages.some((p) => p.name === page);
  return { page: allowed ? page : pages[0].name, id, editing: mode === "edit" };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function notify(type, text) {
  state.notice = { type, text };
  render();
}

// ---------- data ----------

async function loadData() {
  if (state.role === undefined) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", state.session.user.id)
      .maybeSingle();
    state.role = data?.role ?? null;
    if (error) return notify("error", `Couldn't load your account: ${error.message}`);
  }
  // Only admins can read organizations, contacts, athletes and leads.
  if (state.role !== "admin") {
    state.loaded = true;
    render();
    return;
  }

  const [orgs, contacts, athletes, leads, users] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, state, country, created_at, organization_contacts(is_default, contacts(id, first_name, last_name, city, country))"
      )
      .order("name"),
    supabase
      .from("contacts")
      .select(
        `id, first_name, last_name, created_at, ${ADDRESS_FIELDS.join(", ")}, organization_contacts(is_default, organizations(id, name, state, country))`
      )
      .order("last_name")
      .order("first_name"),
    supabase
      .from("athletes")
      .select("id, first_name, last_name, state, country, created_at")
      .order("last_name")
      .order("first_name"),
    // Newest leads first.
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, email, role, created_at").order("email"),
  ]);
  const error = orgs.error || contacts.error || athletes.error || leads.error || users.error;
  if (error) {
    notify("error", `Couldn't load data: ${error.message}`);
    return;
  }
  // Flatten the link rows so each linked record carries the link's is_default flag.
  state.organizations = orgs.data.map(({ organization_contacts: links, ...o }) => ({
    ...o,
    contacts: links.map((l) => ({ ...l.contacts, is_default: l.is_default })).sort(byPerson),
  }));
  state.contacts = contacts.data.map(({ organization_contacts: links, ...c }) => ({
    ...c,
    organizations: links.map((l) => ({ ...l.organizations, is_default: l.is_default })).sort(byName),
  }));
  state.athletes = athletes.data;
  state.leads = leads.data;
  state.users = users.data;
  state.loaded = true;
  render();
}

// Inserts a new row, or updates the existing one when the form carries data-id.
async function saveRow(form, table, row, label) {
  const id = form.dataset.id;
  const query = id
    ? supabase.from(table).update(row).eq("id", id)
    : supabase.from(table).insert(row);
  const { data, error } = await query.select("id").single();
  if (error) return notify("error", `Couldn't save ${label}: ${error.message}`);
  state.notice = { type: "success", text: id ? `Saved ${label}.` : `Added ${label}.` };
  state.keepNotice = true;
  await loadData();
  go(`#/${table}/${data.id}`);
}

async function saveOrganization(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = {
    name: values.name.trim(),
    state: values.state.trim() || null,
    country: values.country.trim() || null,
  };
  if (!row.name) return notify("error", "The organization needs a name.");
  await saveRow(form, "organizations", row, row.name);
}

async function saveContact(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = { first_name: values.first_name.trim(), last_name: values.last_name.trim() };
  for (const field of ADDRESS_FIELDS) row[field] = values[field].trim() || null;
  if (!row.first_name || !row.last_name) return notify("error", "The contact needs a first and last name.");
  await saveRow(form, "contacts", row, fullName(row));
}

async function saveAthlete(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    state: values.state.trim() || null,
    country: values.country.trim() || null,
  };
  if (!row.first_name || !row.last_name) return notify("error", "The athlete needs a first and last name.");
  await saveRow(form, "athletes", row, fullName(row));
}

const LEAD_TEXT_FIELDS = ["organization_name", "email", "phone", "state", "country", "source", "notes"];

async function saveLead(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = { first_name: values.first_name.trim(), last_name: values.last_name.trim(), status: values.status };
  for (const field of LEAD_TEXT_FIELDS) row[field] = values[field].trim() || null;
  if (!row.first_name || !row.last_name) return notify("error", "The lead needs a first and last name.");
  await saveRow(form, "leads", row, fullName(row));
}

async function setLeadStatus(id, status) {
  const lead = state.leads.find((l) => l.id === id);
  const { data, error } = await supabase.from("leads").update({ status }).eq("id", id).select("id");
  if (error) return notify("error", `Couldn't change ${fullName(lead)}: ${error.message}`);
  if (!data.length) return notify("error", `${fullName(lead)} wasn't changed. You may not have permission.`);
  state.notice = { type: "success", text: `${fullName(lead)} is now ${LEAD_STATUSES[status]}.` };
  await loadData();
}

// Works for organizations, contacts, athletes and leads (each loaded into state under its table name).
async function deleteRow(table, id) {
  const record = state[table].find((r) => r.id === id);
  if (!record) return;
  const label = table === "organizations" ? record.name : fullName(record);
  // Organizations and contacts are linked to each other; deleting one removes its links.
  const linked = { organizations: ["contacts", "contact"], contacts: ["organizations", "organization"] }[table];
  const links = linked ? record[linked[0]].length : 0;
  const other = linked?.[1];
  const warning = links
    ? `\n\nIts ${links} ${other} link${links === 1 ? "" : "s"} will be removed too. The ${other}s themselves are kept.`
    : "";
  if (!confirm(`Delete ${label}? This can't be undone.${warning}`)) return;

  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return notify("error", `Couldn't delete ${label}: ${error.message}`);
  if (!data.length) return notify("error", `${label} wasn't deleted. You may not have permission.`);
  state.notice = { type: "success", text: `Deleted ${label}.` };
  state.keepNotice = true;
  await loadData();
  go(`#/${table}`);
}

async function setRole(id, role) {
  const user = state.users.find((u) => u.id === id);
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select("id");
  if (error) return notify("error", `Couldn't change ${user.email}: ${error.message}`);
  if (!data.length) return notify("error", `${user.email} wasn't changed. You may not have permission.`);
  state.notice = { type: "success", text: `${user.email} is now ${ROLE_LABELS[role]}.` };
  await loadData();
}

async function link(organization_id, contact_id) {
  const { error } = await supabase.from("organization_contacts").insert({ organization_id, contact_id });
  if (error) return notify("error", `Couldn't link them: ${error.message}`);
  state.notice = null;
  await loadData();
}

// The database moves the flag off the previous default contact.
async function makeDefault(organization_id, contact_id) {
  const { data, error } = await supabase
    .from("organization_contacts")
    .update({ is_default: true })
    .eq("organization_id", organization_id)
    .eq("contact_id", contact_id)
    .select("contact_id");
  if (error) return notify("error", `Couldn't set the default contact: ${error.message}`);
  if (!data.length) return notify("error", "The default contact wasn't changed. You may not have permission.");
  state.notice = null;
  await loadData();
}

async function unlink(organization_id, contact_id) {
  const { error } = await supabase
    .from("organization_contacts")
    .delete()
    .eq("organization_id", organization_id)
    .eq("contact_id", contact_id);
  if (error) return notify("error", `Couldn't unlink them: ${error.message}`);
  state.notice = null;
  await loadData();
}

// ---------- views ----------

function loginView() {
  const notice = state.notice?.type === "error" ? `<p class="notice error">${esc(state.notice.text)}</p>` : "";
  return `
    <main class="login">
      <form class="card login-card" data-form="login">
        <div class="brand">MARGEN</div>
        <h1>Sign in</h1>
        ${notice}
        <label>Email<input type="email" name="email" required autocomplete="username"></label>
        <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
        <button type="submit" class="primary">Sign in</button>
      </form>
    </main>`;
}

// Shown when the account has no profile row, or it couldn't be loaded.
function noAccessView() {
  const detail = state.notice?.type === "error" ? `<p class="notice error">${esc(state.notice.text)}</p>` : "";
  return `
    <main class="login">
      <div class="card login-card">
        <div class="brand">MARGEN</div>
        <h1>No access yet</h1>
        ${detail}
        <p class="muted">${esc(state.session.user.email)} doesn't have an access level. Ask an admin to set one up.</p>
        <button type="button" data-action="signout">Sign out</button>
      </div>
    </main>`;
}

function shell(page, content) {
  const tabs = visiblePages()
    .map(
      ({ name, label }) =>
        `<a href="#/${name}" class="tab${page === name ? " active" : ""}"${page === name ? ' aria-current="page"' : ""}>${label}</a>`
    )
    .join("");
  const notice = state.notice
    ? `<div class="notice ${state.notice.type}" role="status">
         <span>${esc(state.notice.text)}</span>
         <button type="button" class="icon-btn" data-action="dismiss" aria-label="Dismiss">×</button>
       </div>`
    : "";
  return `
    <header class="topbar">
      <div class="brand">MARGEN</div>
      <nav class="tabs">${tabs}</nav>
      <div class="user">
        <span class="muted">${esc(state.session.user.email)}</span>
        <span class="role">${ROLE_LABELS[state.role]}</span>
        <button type="button" class="ghost" data-action="signout">Sign out</button>
      </div>
    </header>
    <main class="page">${notice}${content}</main>`;
}

function dashboardPage() {
  if (state.role !== "admin") {
    return `
      <div class="page-head"><h1>Dashboard</h1></div>
      <section class="card welcome">
        <h2>Welcome</h2>
        <p class="muted">You're signed in with a ${ROLE_LABELS[state.role]} account. More will appear here soon.</p>
      </section>`;
  }
  const unlinked = state.contacts.filter((c) => !c.organizations.length).length;
  const links = state.organizations.reduce((sum, o) => sum + o.contacts.length, 0);
  const stat = (label, value, href) => `
    <a href="${href}" class="card stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${state.loaded ? value : "…"}</span>
    </a>`;
  return `
    <div class="page-head"><h1>Dashboard</h1></div>
    <div class="stats">
      ${stat("Open leads", state.leads.filter((l) => OPEN_LEAD_STATUSES.includes(l.status)).length, "#/leads")}
      ${stat("Athletes", state.athletes.length, "#/athletes")}
      ${stat("Organizations", state.organizations.length, "#/organizations")}
      ${stat("Contacts", state.contacts.length, "#/contacts")}
      ${stat("Links", links, "#/organizations")}
      ${stat("Contacts without an organization", unlinked, "#/contacts")}
    </div>`;
}

function usersPage() {
  const me = state.session.user.id;
  const roleSelect = (user) => `
    <select data-role-for="${user.id}" aria-label="Access level for ${esc(user.email)}"${user.id === me ? " disabled" : ""}>
      ${Object.entries(ROLE_LABELS)
        .map(([value, label]) => `<option value="${value}"${user.role === value ? " selected" : ""}>${label}</option>`)
        .join("")}
    </select>`;
  const rows = state.users
    .map(
      (u) => `
      <tr data-search="${esc(`${u.email} ${ROLE_LABELS[u.role]}`.toLowerCase())}">
        <td><span class="strong">${esc(u.email) || dash}</span>${u.id === me ? ` <span class="muted small">(you)</span>` : ""}</td>
        <td class="role-cell">${roleSelect(u)}</td>
        <td class="muted hide-sm">${formatDate(u.created_at)}</td>
      </tr>`
    )
    .join("");
  const body = !state.loaded
    ? `<p class="empty">Loading…</p>`
    : `<table class="static"><thead><tr><th>Email</th><th>Access level</th><th class="hide-sm">Added</th></tr></thead><tbody>${rows}</tbody></table>
       <p class="empty no-match" hidden>No matches.</p>`;
  return `
    <div class="page-head">
      <h1>Users <span class="count">${state.users.length}</span></h1>
      <input type="search" class="search" placeholder="Search users" aria-label="Search users">
    </div>
    <section class="card list">${body}</section>
    <p class="muted small hint">New users are added in Supabase (Authentication → Users) and start as Client.
      You can't change your own level, and there must always be at least one Admin.</p>`;
}

function placeholderPage(title) {
  return `
    <div class="page-head"><h1>${title}</h1></div>
    <section class="card"><p class="empty">This section isn't set up yet.</p></section>`;
}

function listPage({ title, count, newHash, newLabel, placeholder, head, rows, panel }) {
  const body = !state.loaded
    ? `<p class="empty">Loading…</p>`
    : rows
      ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
         <p class="empty no-match" hidden>No matches.</p>`
      : `<p class="empty">Nothing here yet.</p>`;
  return `
    <div class="page-head">
      <h1>${title} <span class="count">${count}</span></h1>
      <input type="search" class="search" placeholder="${placeholder}" aria-label="${placeholder}">
      <a href="${newHash}" class="button primary">${newLabel}</a>
    </div>
    <div class="layout${panel ? " has-panel" : ""}">
      <section class="card list">${body}</section>
      ${panel ? `<aside class="card panel">${panel}</aside>` : ""}
    </div>`;
}

function panelHead(title, closeHash) {
  return `
    <div class="panel-head">
      <h2>${esc(title)}</h2>
      <a href="${closeHash}" class="icon-btn" aria-label="Close">×</a>
    </div>`;
}

function formButtons(saveLabel, cancelHash) {
  return `
    <div class="form-actions">
      <button type="submit" class="primary">${saveLabel}</button>
      <a href="${cancelHash}" class="button">Cancel</a>
    </div>`;
}

function organizationForm(org) {
  const back = org ? `#/organizations/${org.id}` : "#/organizations";
  return `
    ${panelHead(org ? "Edit organization" : "New organization", back)}
    <form data-form="organization"${org ? ` data-id="${org.id}"` : ""} class="stack">
      <label>Name<input name="name" required autofocus value="${esc(org?.name)}" placeholder="e.g. Outrigger Canoe Club"></label>
      <label><span>State <span class="muted">(optional)</span></span><input name="state" value="${esc(org?.state)}" placeholder="e.g. Hawaii"></label>
      <label><span>Country <span class="muted">(optional)</span></span><input name="country" value="${esc(org?.country)}" placeholder="e.g. United States"></label>
      ${formButtons(org ? "Save changes" : "Create organization", back)}
    </form>`;
}

function contactForm(contact) {
  const back = contact ? `#/contacts/${contact.id}` : "#/contacts";
  return `
    ${panelHead(contact ? "Edit contact" : "New contact", back)}
    <form data-form="contact"${contact ? ` data-id="${contact.id}"` : ""} class="stack">
      <label>First name<input name="first_name" required autofocus autocomplete="off" value="${esc(contact?.first_name)}"></label>
      <label>Last name<input name="last_name" required autocomplete="off" value="${esc(contact?.last_name)}"></label>
      <fieldset class="stack">
        <legend>Address <span class="muted">(optional)</span></legend>
        <label>Address line 1<input name="address_line1" autocomplete="off" value="${esc(contact?.address_line1)}" placeholder="Street and number"></label>
        <label>Address line 2<input name="address_line2" autocomplete="off" value="${esc(contact?.address_line2)}" placeholder="Apartment, suite, building…"></label>
        <div class="field-row">
          <label>City<input name="city" autocomplete="off" value="${esc(contact?.city)}"></label>
          <label>Postal code<input name="postal_code" autocomplete="off" value="${esc(contact?.postal_code)}"></label>
        </div>
        <div class="field-row">
          <label>State / region<input name="state" autocomplete="off" value="${esc(contact?.state)}"></label>
          <label>Country<input name="country" autocomplete="off" value="${esc(contact?.country)}"></label>
        </div>
      </fieldset>
      ${formButtons(contact ? "Save changes" : "Create contact", back)}
    </form>`;
}

function organizationsPage(id, editing) {
  const rows = state.organizations
    .map(
      (o) => `
      <tr data-href="#/organizations/${o.id}" data-search="${esc(`${o.name} ${place(o)}`.toLowerCase())}">
        <td><a href="#/organizations/${o.id}" class="strong">${esc(o.name)}</a></td>
        <td>${esc(o.state) || dash}</td>
        <td>${esc(o.country) || dash}</td>
        <td class="hide-sm">${(() => {
          const def = o.contacts.find((c) => c.is_default);
          return def ? esc(fullName(def)) : dash;
        })()}</td>
        <td class="num">${o.contacts.length}</td>
      </tr>`
    )
    .join("");

  // A selected organization gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    const org = state.organizations.find((o) => o.id === id);
    if (org) return organizationPage(org, editing);
    return `
      <a href="#/organizations" class="back">← Organizations</a>
      <section class="card"><p class="empty">${state.loaded ? "This organization doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  return listPage({
    title: "Organizations",
    count: state.organizations.length,
    newHash: "#/organizations/new",
    newLabel: "New organization",
    placeholder: "Search organizations",
    head: `<th>Name</th><th>State</th><th>Country</th><th class="hide-sm">Default contact</th><th class="num">Contacts</th>`,
    rows,
    panel: id === "new" ? organizationForm() : "",
  });
}

// Full page for one organization. Each section is its own card, so more (e.g. orders) can be added later.
function organizationPage(org, editing) {
  const defaultContact = org.contacts.find((c) => c.is_default);

  const details = editing
    ? organizationForm(org)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>State</dt><dd>${esc(org.state) || dash}</dd></div>
        <div><dt>Country</dt><dd>${esc(org.country) || dash}</dd></div>
        <div><dt>Default contact</dt><dd>${
          defaultContact ? `<a href="#/contacts/${defaultContact.id}">${esc(fullName(defaultContact))}</a>` : dash
        }</dd></div>
        <div><dt>Added</dt><dd>${formatDate(org.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/organizations" class="back">← Organizations</a>
    <div class="page-head">
      <div class="title-block">
        <h1>${esc(org.name)}</h1>
        <p class="muted">${esc(place(org)) || "No location yet"}</p>
      </div>
      ${
        editing
          ? ""
          : `<a href="#/organizations/${org.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="organizations" data-id="${org.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">${organizationContacts(org)}</section>
    </div>`;
}

function organizationContacts(org) {
  const linked = new Set(org.contacts.map((c) => c.id));
  const available = state.contacts.filter((c) => !linked.has(c.id));
  const rows = org.contacts
    .map(
      (c) => `
      <tr>
        <td><a href="#/contacts/${c.id}" class="strong">${esc(fullName(c))}</a></td>
        <td class="muted hide-sm">${esc(contactLocation(c)) || dash}</td>
        <td>${
          c.is_default
            ? `<span class="badge">Default</span>`
            : `<button type="button" class="ghost small" data-action="make-default" data-org="${org.id}" data-contact="${c.id}">Make default</button>`
        }</td>
        <td class="num"><button type="button" class="ghost small" data-action="unlink" data-org="${org.id}" data-contact="${c.id}">Unlink</button></td>
      </tr>`
    )
    .join("");
  const noDefault =
    org.contacts.length && !org.contacts.some((c) => c.is_default)
      ? `<p class="muted small">No default contact. Choose one with <strong>Make default</strong>.</p>`
      : "";
  const linkForm = available.length
    ? `<form data-form="link" data-org="${org.id}" class="link-form">
         <select name="contact" required aria-label="Contact to link">
           <option value="">Choose a contact to link…</option>
           ${available.map((c) => `<option value="${c.id}">${esc(fullName(c))}</option>`).join("")}
         </select>
         <button type="submit" class="primary">Link</button>
       </form>`
    : `<p class="muted small">${state.contacts.length ? "Every contact is already linked." : "No contacts yet."}
         <a href="#/contacts/new">Add a contact</a></p>`;
  return `
    <h2>Contacts <span class="count">${org.contacts.length}</span></h2>
    ${
      rows
        ? `<div class="table-wrap"><table class="static"><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">No contacts linked yet.</p>`
    }
    ${noDefault}
    ${linkForm}`;
}

function athleteForm(athlete) {
  const back = athlete ? `#/athletes/${athlete.id}` : "#/athletes";
  return `
    ${panelHead(athlete ? "Edit athlete" : "New athlete", back)}
    <form data-form="athlete"${athlete ? ` data-id="${athlete.id}"` : ""} class="stack">
      <label>First name<input name="first_name" required autofocus autocomplete="off" value="${esc(athlete?.first_name)}"></label>
      <label>Last name<input name="last_name" required autocomplete="off" value="${esc(athlete?.last_name)}"></label>
      <label><span>State <span class="muted">(optional)</span></span><input name="state" autocomplete="off" value="${esc(athlete?.state)}" placeholder="e.g. Hawaii"></label>
      <label><span>Country <span class="muted">(optional)</span></span><input name="country" autocomplete="off" value="${esc(athlete?.country)}" placeholder="e.g. United States"></label>
      ${formButtons(athlete ? "Save changes" : "Create athlete", back)}
    </form>`;
}

function athletesPage(id, editing) {
  // A selected athlete gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    const athlete = state.athletes.find((a) => a.id === id);
    if (athlete) return athletePage(athlete, editing);
    return `
      <a href="#/athletes" class="back">← Athletes</a>
      <section class="card"><p class="empty">${state.loaded ? "This athlete doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  const rows = state.athletes
    .map(
      (a) => `
      <tr data-href="#/athletes/${a.id}" data-search="${esc(`${fullName(a)} ${place(a)}`.toLowerCase())}">
        <td><a href="#/athletes/${a.id}" class="strong">${esc(a.first_name)}</a></td>
        <td>${esc(a.last_name)}</td>
        <td>${esc(a.state) || dash}</td>
        <td>${esc(a.country) || dash}</td>
      </tr>`
    )
    .join("");

  return listPage({
    title: "Athletes",
    count: state.athletes.length,
    newHash: "#/athletes/new",
    newLabel: "New athlete",
    placeholder: "Search athletes",
    head: `<th>First name</th><th>Last name</th><th>State</th><th>Country</th>`,
    rows,
    panel: id === "new" ? athleteForm() : "",
  });
}

// Full page for one athlete, laid out like the organization and contact pages.
function athletePage(athlete, editing) {
  const details = editing
    ? athleteForm(athlete)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>State</dt><dd>${esc(athlete.state) || dash}</dd></div>
        <div><dt>Country</dt><dd>${esc(athlete.country) || dash}</dd></div>
        <div><dt>Added</dt><dd>${formatDate(athlete.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/athletes" class="back">← Athletes</a>
    <div class="page-head">
      <div class="title-block">
        <h1>${esc(fullName(athlete))}</h1>
        <p class="muted">${esc(place(athlete)) || "No location yet"}</p>
      </div>
      ${
        editing
          ? ""
          : `<a href="#/athletes/${athlete.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="athletes" data-id="${athlete.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid single">
      <section class="card section">${details}</section>
    </div>`;
}

function statusOptions(selected) {
  return Object.entries(LEAD_STATUSES)
    .map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`)
    .join("");
}

function leadForm(lead) {
  const back = lead ? `#/leads/${lead.id}` : "#/leads";
  const field = (name, label, attrs = "") =>
    `<label><span>${label} <span class="muted">(optional)</span></span><input name="${name}" autocomplete="off" value="${esc(lead?.[name])}" ${attrs}></label>`;
  return `
    ${panelHead(lead ? "Edit lead" : "New lead", back)}
    <form data-form="lead"${lead ? ` data-id="${lead.id}"` : ""} class="stack">
      <div class="field-row">
        <label>First name<input name="first_name" required autofocus autocomplete="off" value="${esc(lead?.first_name)}"></label>
        <label>Last name<input name="last_name" required autocomplete="off" value="${esc(lead?.last_name)}"></label>
      </div>
      ${field("organization_name", "Organization", 'placeholder="Club, team or event"')}
      ${field("email", "Email", 'type="email"')}
      ${field("phone", "Phone", 'type="tel"')}
      <div class="field-row">
        ${field("state", "State")}
        ${field("country", "Country")}
      </div>
      ${field("source", "Source", 'placeholder="e.g. Referral, website, event"')}
      <label>Status<select name="status">${statusOptions(lead?.status ?? "new")}</select></label>
      <label><span>Notes <span class="muted">(optional)</span></span><textarea name="notes" rows="4">${esc(lead?.notes)}</textarea></label>
      ${formButtons(lead ? "Save changes" : "Create lead", back)}
    </form>`;
}

function leadsPage(id, editing) {
  // A selected lead gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    const lead = state.leads.find((l) => l.id === id);
    if (lead) return leadPage(lead, editing);
    return `
      <a href="#/leads" class="back">← Leads</a>
      <section class="card"><p class="empty">${state.loaded ? "This lead doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  const rows = state.leads
    .map(
      (l) => `
      <tr data-href="#/leads/${l.id}"
          data-search="${esc(`${fullName(l)} ${l.organization_name ?? ""} ${l.email ?? ""} ${place(l)} ${l.source ?? ""} ${LEAD_STATUSES[l.status]}`.toLowerCase())}">
        <td><a href="#/leads/${l.id}" class="strong">${esc(fullName(l))}</a></td>
        <td>${esc(l.organization_name) || dash}</td>
        <td>${statusBadge(l.status)}</td>
        <td class="muted hide-sm">${formatDate(l.created_at)}</td>
      </tr>`
    )
    .join("");

  return listPage({
    title: "Leads",
    count: state.leads.length,
    newHash: "#/leads/new",
    newLabel: "New lead",
    placeholder: "Search leads",
    head: `<th>Name</th><th>Organization</th><th>Status</th><th class="hide-sm">Added</th>`,
    rows,
    panel: id === "new" ? leadForm() : "",
  });
}

// Full page for one lead. The status can be changed right from the header.
function leadPage(lead, editing) {
  const details = editing
    ? leadForm(lead)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>Organization</dt><dd>${esc(lead.organization_name) || dash}</dd></div>
        <div><dt>Email</dt><dd>${lead.email ? `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : dash}</dd></div>
        <div><dt>Phone</dt><dd>${lead.phone ? `<a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a>` : dash}</dd></div>
        <div><dt>State</dt><dd>${esc(lead.state) || dash}</dd></div>
        <div><dt>Country</dt><dd>${esc(lead.country) || dash}</dd></div>
        <div><dt>Source</dt><dd>${esc(lead.source) || dash}</dd></div>
        <div><dt>Added</dt><dd>${formatDate(lead.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/leads" class="back">← Leads</a>
    <div class="page-head">
      <div class="title-block">
        <h1>${esc(fullName(lead))} ${statusBadge(lead.status)}</h1>
        <p class="muted">${esc([lead.organization_name, place(lead)].filter(Boolean).join(" · ")) || "No organization yet"}</p>
      </div>
      ${
        editing
          ? ""
          : `<label class="inline-select">Status
               <select data-lead-status-for="${lead.id}" aria-label="Lead status">${statusOptions(lead.status)}</select>
             </label>
             <a href="#/leads/${lead.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="leads" data-id="${lead.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">
        <h2>Notes</h2>
        ${lead.notes ? `<p class="notes">${esc(lead.notes)}</p>` : `<p class="empty">No notes yet.</p>`}
      </section>
    </div>`;
}

function contactsPage(id, editing) {
  const rows = state.contacts
    .map(
      (c) => `
      <tr data-href="#/contacts/${c.id}"
          data-search="${esc(`${fullName(c)} ${addressLines(c).join(" ")} ${c.organizations.map((o) => o.name).join(" ")}`.toLowerCase())}">
        <td><a href="#/contacts/${c.id}" class="strong">${esc(c.first_name)}</a></td>
        <td>${esc(c.last_name)}</td>
        <td class="hide-sm">${esc(contactLocation(c)) || dash}</td>
        <td>${c.organizations.map((o) => esc(o.name)).join(", ") || dash}</td>
      </tr>`
    )
    .join("");

  // A selected contact gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    const contact = state.contacts.find((c) => c.id === id);
    if (contact) return contactPage(contact, editing);
    return `
      <a href="#/contacts" class="back">← Contacts</a>
      <section class="card"><p class="empty">${state.loaded ? "This contact doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  return listPage({
    title: "Contacts",
    count: state.contacts.length,
    newHash: "#/contacts/new",
    newLabel: "New contact",
    placeholder: "Search contacts",
    head: `<th>First name</th><th>Last name</th><th class="hide-sm">Location</th><th>Organizations</th>`,
    rows,
    panel: id === "new" ? contactForm() : "",
  });
}

// Full page for one contact, laid out like the organization page.
function contactPage(contact, editing) {
  const lines = addressLines(contact);
  const details = editing
    ? contactForm(contact)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>Address</dt><dd>${
          lines.length
            ? `<address class="address">${lines.map(esc).join("<br>")}</address>`
            : `<span class="muted">No address yet.</span> <a href="#/contacts/${contact.id}/edit">Add one</a>`
        }</dd></div>
        <div><dt>Added</dt><dd>${formatDate(contact.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/contacts" class="back">← Contacts</a>
    <div class="page-head">
      <div class="title-block">
        <h1>${esc(fullName(contact))}</h1>
        <p class="muted">${esc(contactLocation(contact)) || "No location yet"}</p>
      </div>
      ${
        editing
          ? ""
          : `<a href="#/contacts/${contact.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="contacts" data-id="${contact.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">${contactOrganizations(contact)}</section>
    </div>`;
}

function contactOrganizations(contact) {
  const linked = new Set(contact.organizations.map((o) => o.id));
  const available = state.organizations.filter((o) => !linked.has(o.id));
  const rows = contact.organizations
    .map(
      (o) => `
      <tr>
        <td><a href="#/organizations/${o.id}" class="strong">${esc(o.name)}</a></td>
        <td class="muted hide-sm">${esc(place(o)) || dash}</td>
        <td>${
          o.is_default
            ? `<span class="badge" title="Default contact for ${esc(o.name)}">Default</span>`
            : `<button type="button" class="ghost small" data-action="make-default" data-org="${o.id}" data-contact="${contact.id}">Make default</button>`
        }</td>
        <td class="num"><button type="button" class="ghost small" data-action="unlink" data-org="${o.id}" data-contact="${contact.id}">Unlink</button></td>
      </tr>`
    )
    .join("");
  const linkForm = available.length
    ? `<form data-form="link" data-contact="${contact.id}" class="link-form">
         <select name="organization" required aria-label="Organization to link">
           <option value="">Choose an organization to link…</option>
           ${available.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}
         </select>
         <button type="submit" class="primary">Link</button>
       </form>`
    : `<p class="muted small">${state.organizations.length ? "Already linked to every organization." : "No organizations yet."}
         <a href="#/organizations/new">Add an organization</a></p>`;
  return `
    <h2>Organizations <span class="count">${contact.organizations.length}</span></h2>
    ${
      rows
        ? `<div class="table-wrap"><table class="static"><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">Not linked to any organization yet.</p>`
    }
    ${linkForm}`;
}

function render() {
  if (state.session === undefined) {
    app.innerHTML = `<p class="loading">Loading…</p>`;
    return;
  }
  if (!state.session) {
    app.innerHTML = loginView();
    return;
  }
  if (state.role === undefined) {
    app.innerHTML = `<p class="loading">Loading…</p>`;
    return;
  }
  if (!state.role) {
    app.innerHTML = noAccessView();
    return;
  }
  const { page, id, editing } = route();
  const content = {
    dashboard: () => dashboardPage(),
    customs: () => placeholderPage("Customs"),
    shopify: () => placeholderPage("Shopify"),
    organizations: () => organizationsPage(id, editing),
    contacts: () => contactsPage(id, editing),
    athletes: () => athletesPage(id, editing),
    leads: () => leadsPage(id, editing),
    users: () => usersPage(),
  }[page]();
  app.innerHTML = shell(page, content);
  app.querySelector("[autofocus]")?.focus();
}

// ---------- events ----------

app.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;

  switch (form.dataset.form) {
    case "login": {
      const { email, password } = Object.fromEntries(new FormData(form));
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) notify("error", error.message);
      break;
    }
    case "organization":
      await saveOrganization(form);
      break;
    case "contact":
      await saveContact(form);
      break;
    case "athlete":
      await saveAthlete(form);
      break;
    case "lead":
      await saveLead(form);
      break;
    case "link": {
      const choice = new FormData(form);
      await link(
        form.dataset.org ?? choice.get("organization"),
        form.dataset.contact ?? choice.get("contact")
      );
      break;
    }
  }
  if (button?.isConnected) button.disabled = false;
});

app.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    switch (action.dataset.action) {
      case "dismiss":
        state.notice = null;
        render();
        break;
      case "signout":
        await supabase.auth.signOut();
        break;
      case "unlink":
        action.disabled = true;
        await unlink(action.dataset.org, action.dataset.contact);
        break;
      case "delete":
        await deleteRow(action.dataset.table, action.dataset.id);
        break;
      case "make-default":
        action.disabled = true;
        await makeDefault(action.dataset.org, action.dataset.contact);
        break;
    }
    return;
  }
  // Whole table rows act as links to the row's detail panel.
  const row = event.target.closest("tr[data-href]");
  if (row && !event.target.closest("a")) go(row.dataset.href);
});

app.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-role-for], select[data-lead-status-for]");
  if (!select) return;
  select.disabled = true;
  if (select.dataset.roleFor) await setRole(select.dataset.roleFor, select.value);
  else await setLeadStatus(select.dataset.leadStatusFor, select.value);
});

// Filter rows in place so the search box keeps focus while typing.
app.addEventListener("input", (event) => {
  if (!event.target.matches(".search")) return;
  const query = event.target.value.trim().toLowerCase();
  const rows = [...app.querySelectorAll("tr[data-search]")];
  rows.forEach((row) => (row.hidden = !row.dataset.search.includes(query)));
  const noMatch = app.querySelector(".no-match");
  if (noMatch) noMatch.hidden = rows.some((row) => !row.hidden);
});

// A notice is dropped on navigation, except the one that announced the navigation itself.
window.addEventListener("hashchange", () => {
  if (state.keepNotice) state.keepNotice = false;
  else state.notice = null;
  render();
  window.scrollTo(0, 0);
});

supabase.auth.onAuthStateChange((event, session) => {
  const previousUser = state.session?.user.id;
  const userChanged = session?.user.id !== previousUser;
  state.session = session;
  if (userChanged) {
    state.role = undefined;
    state.organizations = [];
    state.contacts = [];
    state.loaded = false;
  }
  if (session) state.notice = null;
  render();
  // Defer Supabase calls out of the auth callback, as supabase-js recommends.
  if (session && (userChanged || event === "SIGNED_IN")) setTimeout(loadData, 0);
});
