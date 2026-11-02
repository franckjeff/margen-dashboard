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
  orders: [],
  users: [], // profiles, admins only
  loaded: false,
  role: undefined, // undefined = still loading, null = no profile, else "admin" | "factory" | "client"
  notice: null, // { type: "error" | "success", text }
  keepNotice: false,
  importPreview: null, // { fileName, raw, rows } while an order spreadsheet is being checked
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

// Must match the check constraints on orders.order_status and orders.production_status.
const ORDER_STATUSES = { received: "Received", accepted: "Accepted", on_hold: "On hold", cancelled: "Cancelled", closed: "Closed" };
const PRODUCTION_STATUSES = {
  job_sheet_approved: "Job sheet approved",
  artwork_in_progress: "Artwork in progress",
  in_printing_queue: "In printing queue",
  sewing: "Sewing",
  trimming: "Trimming",
  shipped: "Shipped",
};
const ORDER_TONES = { received: "accent", accepted: "accent", on_hold: "warn", cancelled: "muted", closed: "success" };
const orderBadge = (status) => `<span class="status tone-${ORDER_TONES[status]}">${ORDER_STATUSES[status]}</span>`;
// An empty production status means the factory hasn't started.
const productionBadge = (status) =>
  status
    ? `<span class="status tone-${status === "shipped" ? "success" : "accent"}">${PRODUCTION_STATUSES[status]}</span>`
    : `<span class="muted small">Not started</span>`;

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

// Pages whose URL differs from their table's name.
const TABLE_ROUTES = { orders: "customs" };
const routeFor = (table) => TABLE_ROUTES[table] ?? table;

// Hash routes: #/dashboard, #/shopify, #/users, plus #/organizations,
// #/organizations/new, #/organizations/<id>, #/organizations/<id>/edit, and the same for
// athletes, leads, contacts and customs (orders).
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
  // Only admins can read organizations, contacts, athletes, leads and orders.
  if (state.role !== "admin") {
    state.loaded = true;
    render();
    return;
  }

  const [orgs, contacts, athletes, leads, orders, users] = await Promise.all([
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
    // Newest orders first, with the linked organization's name.
    supabase
      .from("orders")
      .select(
        "id, margen_order_id, factory_order_id, order_status, production_status, organization_id, created_at, organization:organizations(id, name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, email, role, created_at").order("email"),
  ]);
  const error = orgs.error || contacts.error || athletes.error || leads.error || orders.error || users.error;
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
  state.orders = orders.data;
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
  if (error?.code === "23505") return notify("error", `Couldn't save ${label}: that ID is already used by another record.`);
  if (error) return notify("error", `Couldn't save ${label}: ${error.message}`);
  state.notice = { type: "success", text: id ? `Saved ${label}.` : `Added ${label}.` };
  state.keepNotice = true;
  await loadData();
  go(`#/${routeFor(table)}/${data.id}`);
}

async function saveOrder(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = {
    margen_order_id: values.margen_order_id.trim(),
    factory_order_id: values.factory_order_id.trim() || null,
    organization_id: values.organization_id || null,
    order_status: values.order_status,
    production_status: values.production_status || null,
  };
  if (!row.margen_order_id) return notify("error", "The order needs a Margen order ID.");
  await saveRow(form, "orders", row, `order ${row.margen_order_id}`);
}

// ---------- order import ----------

// SheetJS is only downloaded when someone imports a file or asks for the template.
const loadSheetJS = () => import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");

// Headings each order field accepts, compared without case, spaces or punctuation.
const IMPORT_COLUMNS = {
  margen_order_id: ["margenorderid", "margenid", "margenorder"],
  factory_order_id: ["factoryorderid", "factoryid", "factoryorder"],
  organization: ["organization", "organisation", "org", "client"],
  order_status: ["orderstatus", "status"],
  production_status: ["productionstatus", "production"],
};
const IMPORT_TEMPLATE = [
  ["Margen order ID", "Factory order ID", "Organization", "Order status", "Production status"],
  ["2026_1_OUTRIGGER", "RKU12060-M", "Outrigger Canoe Club", "Accepted", "Sewing"],
];
const CHANGE_LABELS = {
  factory_order_id: "factory ID",
  organization_id: "organization",
  order_status: "order status",
  production_status: "production",
};
const squash = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameName = (a, b) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

// Status key for a cell such as "On hold", "on_hold" or "ON HOLD"; undefined if it isn't one.
const parseStatus = (labels, text) =>
  Object.keys(labels).find((key) => squash(key) === squash(text) || squash(labels[key]) === squash(text));

async function downloadImportTemplate() {
  try {
    const XLSX = await loadSheetJS();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(IMPORT_TEMPLATE), "Orders");
    XLSX.writeFile(book, "margen-orders-template.xlsx");
  } catch (error) {
    notify("error", `Couldn't create the template: ${error.message}`);
  }
}

// Reads the first sheet of an Excel or CSV file into rows keyed by order field.
async function readImportFile(file) {
  let table;
  try {
    const XLSX = await loadSheetJS();
    const book = XLSX.read(await file.arrayBuffer());
    table = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, defval: "" });
  } catch (error) {
    return notify("error", `Couldn't read ${file.name}: ${error.message}`);
  }
  const [headings = [], ...lines] = table;
  const columns = {};
  headings.forEach((heading, index) => {
    const field = Object.keys(IMPORT_COLUMNS).find((f) => IMPORT_COLUMNS[f].includes(squash(heading)));
    if (field && !(field in columns)) columns[field] = index;
  });
  if (!("margen_order_id" in columns)) {
    return notify("error", `${file.name} has no "Margen order ID" column. Download the template to see the expected columns.`);
  }
  const raw = lines
    .map((cells, index) => ({
      line: index + 2, // spreadsheet row number, counting the heading row
      ...Object.fromEntries(
        Object.keys(IMPORT_COLUMNS).map((f) => [f, f in columns ? String(cells[columns[f]] ?? "").trim() : ""])
      ),
    }))
    .filter((row) => Object.keys(IMPORT_COLUMNS).some((f) => row[f]));
  if (!raw.length) return notify("error", `${file.name} has no orders in it.`);
  state.importPreview = { fileName: file.name, raw, rows: checkImportRows(raw) };
  state.notice = null;
  render();
}

// Works out what each row would do: add an order, update the order with the same
// Margen order ID (only the filled-in cells), change nothing, or be skipped for errors.
function checkImportRows(raw) {
  const seenMargen = new Set();
  const seenFactory = new Set();
  return raw.map((row) => {
    const errors = [];
    const change = {};
    const existing = state.orders.find((o) => o.margen_order_id === row.margen_order_id);

    if (!row.margen_order_id) errors.push("Margen order ID is missing");
    else if (seenMargen.has(row.margen_order_id)) errors.push("Margen order ID is in the file twice");
    seenMargen.add(row.margen_order_id);

    if (row.factory_order_id) {
      const owner = state.orders.find((o) => o.factory_order_id === row.factory_order_id);
      if (seenFactory.has(row.factory_order_id)) errors.push("Factory order ID is in the file twice");
      else if (owner && owner !== existing) errors.push(`Factory order ID is already used by ${owner.margen_order_id}`);
      seenFactory.add(row.factory_order_id);
      change.factory_order_id = row.factory_order_id;
    }
    if (row.organization) {
      const org = state.organizations.find((o) => sameName(o.name, row.organization));
      if (org) change.organization_id = org.id;
      else errors.push(`No organization called "${row.organization}"`);
    }
    if (row.order_status) {
      const status = parseStatus(ORDER_STATUSES, row.order_status);
      if (status) change.order_status = status;
      else errors.push(`"${row.order_status}" isn't an order status`);
    }
    if (row.production_status) {
      const status =
        squash(row.production_status) === "notstarted" ? null : parseStatus(PRODUCTION_STATUSES, row.production_status);
      if (status !== undefined) change.production_status = status;
      else errors.push(`"${row.production_status}" isn't a production status`);
    }

    if (existing) for (const field of Object.keys(change)) if (change[field] === existing[field]) delete change[field];
    const action = errors.length ? "error" : !existing ? "new" : Object.keys(change).length ? "update" : "same";
    return { ...row, errors, change, existing, action };
  });
}

async function importOrders() {
  const { raw, rows } = state.importPreview;
  const added = rows
    .filter((r) => r.action === "new")
    .map((r) => ({
      margen_order_id: r.margen_order_id,
      factory_order_id: null,
      organization_id: null,
      order_status: "received",
      production_status: null,
      ...r.change,
    }));
  const updates = rows.filter((r) => r.action === "update");
  const failures = [];
  // New orders go in as one insert, so they are all added or none are.
  if (added.length) {
    const { error } = await supabase.from("orders").insert(added);
    if (error) failures.push(`the new orders weren't added (${error.message})`);
  }
  for (const r of updates) {
    const { error } = await supabase.from("orders").update(r.change).eq("id", r.existing.id);
    if (error) failures.push(`${r.margen_order_id} wasn't updated (${error.message})`);
  }
  await loadData();
  if (failures.length) {
    state.importPreview.rows = checkImportRows(raw);
    return notify("error", `Import incomplete: ${failures.join("; ")}.`);
  }
  const parts = [];
  if (added.length) parts.push(`added ${added.length} order${added.length === 1 ? "" : "s"}`);
  if (updates.length) parts.push(`updated ${updates.length}`);
  state.importPreview = null;
  state.notice = { type: "success", text: `Import done: ${parts.join(" and ")}.` };
  state.keepNotice = true;
  go("#/customs");
}

// Quick status change from an order page; field is "order_status" or "production_status".
async function setOrderField(id, field, value) {
  const order = state.orders.find((o) => o.id === id);
  const label = `order ${order.margen_order_id}`;
  const { data, error } = await supabase
    .from("orders")
    .update({ [field]: value || null })
    .eq("id", id)
    .select("id");
  if (error) return notify("error", `Couldn't change ${label}: ${error.message}`);
  if (!data.length) return notify("error", `${label} wasn't changed. You may not have permission.`);
  const text =
    field === "order_status"
      ? `${label} is now ${ORDER_STATUSES[value]}.`
      : `${label} production: ${value ? PRODUCTION_STATUSES[value] : "Not started"}.`;
  state.notice = { type: "success", text: text.charAt(0).toUpperCase() + text.slice(1) };
  await loadData();
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

// Works for every table loaded into state under its own name.
async function deleteRow(table, id) {
  const record = state[table].find((r) => r.id === id);
  if (!record) return;
  const label =
    table === "organizations" ? record.name : table === "orders" ? `order ${record.margen_order_id}` : fullName(record);
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
  go(`#/${routeFor(table)}`);
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
      ${stat("Orders", state.orders.length, "#/customs")}
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

function listPage({ title, count, newHash, newLabel, placeholder, head, rows, panel, actions = "" }) {
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
      ${actions}
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
      <section class="card section span-all">${organizationOrders(org)}</section>
    </div>`;
}

function organizationOrders(org) {
  const orders = state.orders.filter((o) => o.organization_id === org.id);
  const rows = orders
    .map(
      (o) => `
      <tr>
        <td><a href="#/customs/${o.id}" class="strong mono">${esc(o.margen_order_id)}</a></td>
        <td class="mono hide-sm">${esc(o.factory_order_id) || dash}</td>
        <td>${orderBadge(o.order_status)}</td>
        <td>${productionBadge(o.production_status)}</td>
        <td class="muted num hide-sm">${formatDate(o.created_at)}</td>
      </tr>`
    )
    .join("");
  return `
    <h2>Orders <span class="count">${orders.length}</span></h2>
    ${
      rows
        ? `<div class="table-wrap"><table class="static"><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">No orders yet. <a href="#/customs/new">Add one in Customs</a> and choose this organization.</p>`
    }`;
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

function orderForm(order) {
  const back = order ? `#/customs/${order.id}` : "#/customs";
  const options = state.organizations
    .map((o) => `<option value="${o.id}"${o.id === order?.organization_id ? " selected" : ""}>${esc(o.name)}</option>`)
    .join("");
  return `
    ${panelHead(order ? "Edit order" : "New order", back)}
    <form data-form="order"${order ? ` data-id="${order.id}"` : ""} class="stack">
      <label>Margen order ID<input name="margen_order_id" required autofocus autocomplete="off" value="${esc(order?.margen_order_id)}" placeholder="e.g. 2026_1_OUTRIGGER"></label>
      <label><span>Factory order ID <span class="muted">(optional)</span></span><input name="factory_order_id" autocomplete="off" value="${esc(order?.factory_order_id)}" placeholder="e.g. RKU12060-M"></label>
      <label><span>Organization <span class="muted">(optional)</span></span>
        <select name="organization_id"><option value="">No organization</option>${options}</select>
      </label>
      <div class="field-row">
        <label>Order status<select name="order_status">${optionsFor(ORDER_STATUSES, order?.order_status ?? "received")}</select></label>
        <label>Production status<select name="production_status">${optionsFor(PRODUCTION_STATUSES, order?.production_status ?? "", "Not started")}</select></label>
      </div>
      ${formButtons(order ? "Save changes" : "Create order", back)}
    </form>`;
}

const orderOrganization = (order) =>
  order.organization ? `<a href="#/organizations/${order.organization.id}">${esc(order.organization.name)}</a>` : dash;

// Orders live under the Customs menu (#/customs), but in the "orders" table.
function ordersPage(id, editing) {
  if (id === "import") return importPage();
  if (id && id !== "new") {
    const order = state.orders.find((o) => o.id === id);
    if (order) return orderPage(order, editing);
    return `
      <a href="#/customs" class="back">← Customs</a>
      <section class="card"><p class="empty">${state.loaded ? "This order doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  const rows = state.orders
    .map(
      (o) => `
      <tr data-href="#/customs/${o.id}"
          data-search="${esc(
            `${o.margen_order_id} ${o.factory_order_id ?? ""} ${o.organization?.name ?? ""} ${ORDER_STATUSES[o.order_status]} ${
              o.production_status ? PRODUCTION_STATUSES[o.production_status] : "not started"
            }`.toLowerCase()
          )}">
        <td><a href="#/customs/${o.id}" class="strong mono">${esc(o.margen_order_id)}</a></td>
        <td class="mono hide-sm">${esc(o.factory_order_id) || dash}</td>
        <td class="hide-sm">${orderOrganization(o)}</td>
        <td>${orderBadge(o.order_status)}</td>
        <td>${productionBadge(o.production_status)}</td>
      </tr>`
    )
    .join("");

  return listPage({
    title: "Customs",
    count: state.orders.length,
    newHash: "#/customs/new",
    newLabel: "New order",
    placeholder: "Search orders",
    head: `<th>Margen order ID</th><th class="hide-sm">Factory order ID</th><th class="hide-sm">Organization</th><th>Order status</th><th>Production</th>`,
    rows,
    panel: id === "new" ? orderForm() : "",
    actions: `<a href="#/customs/import" class="button">Import from Excel</a>`,
  });
}

function importPage() {
  const preview = state.importPreview;
  return `
    <a href="#/customs" class="back">← Customs</a>
    <div class="page-head">
      <div class="title-block">
        <h1>Import orders</h1>
        <p class="muted">Orders whose Margen order ID already exists are updated. The others are added.</p>
      </div>
      <button type="button" data-action="import-template">Download template</button>
    </div>
    <div class="stack">
      <section class="card section">
        <label>Excel or CSV file<input type="file" accept=".xlsx,.xls,.csv" data-import-file></label>
        <p class="muted small import-help">
          The first sheet is read. Columns: <strong>Margen order ID</strong> (required), Factory order ID,
          Organization (its exact name), Order status and Production status.
          Blank cells leave an existing order's value as it is; write "Not started" to clear a production status.
        </p>
      </section>
      ${preview ? importPreviewSection(preview) : ""}
    </div>`;
}

function importPreviewSection({ fileName, rows }) {
  const count = (action) => rows.filter((r) => r.action === action).length;
  const ready = count("new") + count("update");
  const summary = [
    [count("new"), "new"],
    [count("update"), "to update"],
    [count("same"), "unchanged"],
    [count("error"), "with problems, skipped"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  const result = (r) =>
    ({
      new: `<span class="status tone-accent">New</span>`,
      update: `<span class="status tone-success">Update</span> <span class="muted small">${Object.keys(r.change)
        .map((f) => CHANGE_LABELS[f])
        .join(", ")}</span>`,
      same: `<span class="muted small">No change</span>`,
      error: `<span class="error-text small">${esc(r.errors.join(". "))}</span>`,
    })[r.action];
  const body = rows
    .map(
      (r) => `
      <tr${r.action === "error" ? ` class="row-error"` : ""}>
        <td class="muted num">${r.line}</td>
        <td class="mono">${esc(r.margen_order_id) || dash}</td>
        <td class="mono hide-sm">${esc(r.factory_order_id) || dash}</td>
        <td class="hide-sm">${esc(r.organization) || dash}</td>
        <td class="hide-sm">${esc(r.order_status) || dash}</td>
        <td class="hide-sm">${esc(r.production_status) || dash}</td>
        <td>${result(r)}</td>
      </tr>`
    )
    .join("");
  return `
    <section class="card section">
      <div class="panel-head">
        <div><h2>${esc(fileName)}</h2><p class="muted small">${rows.length} row${rows.length === 1 ? "" : "s"}: ${summary}</p></div>
      </div>
      <div class="table-wrap">
        <table class="static">
          <thead><tr><th class="num">Row</th><th>Margen order ID</th><th class="hide-sm">Factory order ID</th><th class="hide-sm">Organization</th><th class="hide-sm">Order status</th><th class="hide-sm">Production</th><th>Result</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="form-actions import-actions">
        <button type="button" class="primary" data-action="import-orders"${ready ? "" : " disabled"}>
          ${ready ? `Import ${ready} order${ready === 1 ? "" : "s"}` : "Nothing to import"}
        </button>
        <button type="button" data-action="import-clear">Clear</button>
      </div>
    </section>`;
}

function orderPage(order, editing) {
  const details = editing
    ? orderForm(order)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>Margen order ID</dt><dd class="mono">${esc(order.margen_order_id)}</dd></div>
        <div><dt>Factory order ID</dt><dd class="mono">${esc(order.factory_order_id) || dash}</dd></div>
        <div><dt>Organization</dt><dd>${orderOrganization(order)}</dd></div>
        <div><dt>Order status</dt><dd>${orderBadge(order.order_status)}</dd></div>
        <div><dt>Production status</dt><dd>${productionBadge(order.production_status)}</dd></div>
        <div><dt>Added</dt><dd>${formatDate(order.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/customs" class="back">← Customs</a>
    <div class="page-head">
      <div class="title-block">
        <h1 class="mono">${esc(order.margen_order_id)}</h1>
        <p class="muted">${order.factory_order_id ? `Factory order ${esc(order.factory_order_id)}` : "No factory order ID yet"}</p>
      </div>
      ${
        editing
          ? ""
          : `<label class="inline-select">Order
               <select data-order-field="order_status" data-order-id="${order.id}" aria-label="Order status">${optionsFor(
                 ORDER_STATUSES,
                 order.order_status
               )}</select>
             </label>
             <label class="inline-select">Production
               <select data-order-field="production_status" data-order-id="${order.id}" aria-label="Production status">${optionsFor(
                 PRODUCTION_STATUSES,
                 order.production_status ?? "",
                 "Not started"
               )}</select>
             </label>
             <a href="#/customs/${order.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="orders" data-id="${order.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid single">
      <section class="card section">${details}</section>
    </div>`;
}

// <option>s for a { value: label } map; emptyLabel adds a first option with an empty value.
function optionsFor(labels, selected, emptyLabel) {
  const entries = emptyLabel ? [["", emptyLabel], ...Object.entries(labels)] : Object.entries(labels);
  return entries
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
      <label>Status<select name="status">${optionsFor(LEAD_STATUSES, lead?.status ?? "new")}</select></label>
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
               <select data-lead-status-for="${lead.id}" aria-label="Lead status">${optionsFor(LEAD_STATUSES, lead.status)}</select>
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
    customs: () => ordersPage(id, editing),
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
    case "order":
      await saveOrder(form);
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
      case "import-template":
        await downloadImportTemplate();
        break;
      case "import-orders":
        action.disabled = true;
        action.textContent = "Importing…";
        await importOrders();
        break;
      case "import-clear":
        state.importPreview = null;
        render();
        break;
    }
    return;
  }
  // Whole table rows act as links to the row's detail panel.
  const row = event.target.closest("tr[data-href]");
  if (row && !event.target.closest("a")) go(row.dataset.href);
});

app.addEventListener("change", async (event) => {
  if (event.target.matches("input[data-import-file]")) {
    const [file] = event.target.files;
    if (file) await readImportFile(file);
    return;
  }
  const select = event.target.closest("select[data-role-for], select[data-lead-status-for], select[data-order-field]");
  if (!select) return;
  select.disabled = true;
  if (select.dataset.roleFor) await setRole(select.dataset.roleFor, select.value);
  else if (select.dataset.orderField) await setOrderField(select.dataset.orderId, select.dataset.orderField, select.value);
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
    state.importPreview = null;
    state.loaded = false;
  }
  if (session) state.notice = null;
  render();
  // Defer Supabase calls out of the auth callback, as supabase-js recommends.
  if (session && (userChanged || event === "SIGNED_IN")) setTimeout(loadData, 0);
});
