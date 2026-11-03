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
  orderEvents: [], // audit trail of every order change, newest first
  items: [], // garments, by name
  orderItems: [], // order lines: { order_id, item_id, size, quantity }
  notes: [], // newest first; each has a contact_id or an athlete_id
  dismissedNotes: new Set(), // ids of notes this user has hidden from the Dashboard
  users: [], // profiles, admins only
  loaded: false,
  role: undefined, // undefined = still loading, null = no profile, else "admin" | "factory" | "client"
  notice: null, // { type: "error" | "success", text }
  keepNotice: false,
  importPreview: null, // { fileName, raw, rows } while an order spreadsheet is being checked
  menuGroups: {}, // menu group name -> open (true) or closed (false), once the user toggles it
  orgFilters: { country: "", state: "" }, // Organizations list filters; "" means all
  reportFilters: {}, // report id -> { filter name: value }; "" means all
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
const formatDateTime = (date) =>
  new Date(date).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
// Must match the check constraint on order_items.size. Adult sizes, then junior, in display order.
const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const JUNIOR_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16"];
const SIZES = [...ADULT_SIZES, ...JUNIOR_SIZES];
const sizeOptions = () =>
  `<optgroup label="Adult">${ADULT_SIZES.map((s) => `<option>${s}</option>`).join("")}</optgroup>` +
  `<optgroup label="Junior">${JUNIOR_SIZES.map((s) => `<option>${s}</option>`).join("")}</optgroup>`;
// An order's lines with their item, sorted by item name then size.
const orderLinesOf = (orderId) =>
  state.orderItems
    .filter((l) => l.order_id === orderId)
    .map((l) => ({ ...l, item: state.items.find((i) => i.id === l.item_id) }))
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
const piecesIn = (orderId) =>
  state.orderItems.filter((l) => l.order_id === orderId).reduce((sum, l) => sum + l.quantity, 0);

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
  // Consecutive pages with the same group sit under that heading in the menu.
  { name: "customs", label: "Customs", roles: ["admin"], group: "Orders" },
  { name: "shopify", label: "Shopify", roles: ["admin"], group: "Orders" },
  { name: "items", label: "Items", roles: ["admin"], group: "Orders" },
  { name: "athletes", label: "Athletes", roles: ["admin"] },
  { name: "leads", label: "Leads", roles: ["admin"], group: "Clients" },
  { name: "organizations", label: "Organizations", roles: ["admin"], group: "Clients" },
  { name: "contacts", label: "Contacts", roles: ["admin"], group: "Clients" },
  { name: "reports", label: "Reports", roles: ["admin"] },
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

  const [orgs, contacts, athletes, leads, orders, orderEvents, items, orderItems, notes, dismissals, users] = await Promise.all([
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
    // Written by a database trigger on every order change; newest first, with who made it.
    supabase
      .from("order_events")
      .select("id, order_id, action, changes, changed_at, author:profiles(email)")
      .order("changed_at", { ascending: false }),
    supabase.from("items").select("id, item_code, name, created_at").order("name"),
    supabase.from("order_items").select("id, order_id, item_id, size, quantity"),
    // Newest notes first, with who wrote them. The foreign key is named because notes also
    // reach profiles through note_dismissals, which makes a bare "profiles" ambiguous.
    supabase
      .from("notes")
      .select("id, contact_id, athlete_id, body, created_at, author:profiles!notes_created_by_fkey(email)")
      .order("created_at", { ascending: false }),
    // Only this user's own dismissals are visible to them.
    supabase.from("note_dismissals").select("note_id"),
    supabase.from("profiles").select("id, email, role, created_at").order("email"),
  ]);
  const error =
    orgs.error ||
    contacts.error ||
    athletes.error ||
    leads.error ||
    orders.error ||
    orderEvents.error ||
    items.error ||
    orderItems.error ||
    notes.error ||
    dismissals.error ||
    users.error;
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
  state.orderEvents = orderEvents.data;
  state.items = items.data;
  state.orderItems = orderItems.data;
  state.notes = notes.data;
  state.dismissedNotes = new Set(dismissals.data.map((d) => d.note_id));
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

// ---------- reports ----------

// Each report: its filters (built from current data), which records match them, optionally how
// the records become spreadsheet rows (rows; one row per record if left out), and the
// spreadsheet columns as [heading, value, width]. Add a new report by adding an entry here.
const REPORTS = [
  {
    id: "orders",
    title: "Order report",
    description: "Every order with its IDs, organization, statuses and date added.",
    noun: ["order", "orders"],
    fileName: "margen-order-report",
    filters: () => [
      {
        name: "organization_id",
        label: "Organization",
        options: [
          ["", "All organizations"],
          ...state.organizations.map((o) => [o.id, o.name]).sort((a, b) => a[1].localeCompare(b[1])),
          ["none", "No organization"],
        ],
      },
      { name: "order_status", label: "Order status", options: [["", "All order statuses"], ...Object.entries(ORDER_STATUSES)] },
      {
        name: "production_status",
        label: "Production status",
        options: [["", "All production statuses"], ["not_started", "Not started"], ...Object.entries(PRODUCTION_STATUSES)],
      },
      { name: "from", label: "Added from", type: "date" },
      { name: "to", label: "Added to", type: "date" },
    ],
    records: (f) =>
      state.orders.filter(
        (o) =>
          (!f.organization_id || (f.organization_id === "none" ? !o.organization_id : o.organization_id === f.organization_id)) &&
          (!f.order_status || o.order_status === f.order_status) &&
          (!f.production_status || (o.production_status ?? "not_started") === f.production_status) &&
          withinDates(o.created_at, f.from, f.to)
      ),
    columns: [
      ["Margen order ID", (o) => o.margen_order_id, 22],
      ["Factory order ID", (o) => o.factory_order_id ?? "", 18],
      ["Organization", (o) => o.organization?.name ?? "", 30],
      ["Order status", (o) => ORDER_STATUSES[o.order_status], 14],
      ["Production status", (o) => (o.production_status ? PRODUCTION_STATUSES[o.production_status] : "Not started"), 20],
      ["Pieces", (o) => piecesIn(o.id), 10],
      ["Added", (o) => new Date(o.created_at), 14],
    ],
  },
  {
    id: "order_detail",
    title: "Order detail report",
    description:
      "Orders with all their details and every item ordered: one row per item and size. Search for an order ID, or leave it empty for every order.",
    noun: ["order", "orders"],
    fileName: "margen-order-detail",
    filters: () => [
      {
        name: "order",
        label: "Order ID",
        type: "search",
        placeholder: "Margen or factory order ID",
        suggestions: state.orders.map((o) => o.margen_order_id),
      },
    ],
    // Matches any part of the Margen or factory order ID, ignoring case.
    records: (f) => {
      const query = (f.order ?? "").trim().toLowerCase();
      return state.orders.filter(
        (o) => o.margen_order_id.toLowerCase().includes(query) || (o.factory_order_id ?? "").toLowerCase().includes(query)
      );
    },
    // One spreadsheet row per order line; an order without items still gets a row.
    rows: (orders) =>
      orders.flatMap((order) => {
        const lines = orderLinesOf(order.id);
        return lines.length ? lines.map((line) => ({ order, line })) : [{ order, line: null }];
      }),
    columns: [
      ["Margen order ID", ({ order }) => order.margen_order_id, 22],
      ["Factory order ID", ({ order }) => order.factory_order_id ?? "", 18],
      ["Organization", ({ order }) => order.organization?.name ?? "", 30],
      ["Order status", ({ order }) => ORDER_STATUSES[order.order_status], 14],
      ["Production status", ({ order }) => (order.production_status ? PRODUCTION_STATUSES[order.production_status] : "Not started"), 20],
      ["Added", ({ order }) => new Date(order.created_at), 14],
      ["Item ID", ({ line }) => line?.item.item_code ?? "", 18],
      ["Item", ({ line }) => line?.item.name ?? "", 26],
      ["Size", ({ line }) => line?.size ?? "", 8],
      ["Quantity", ({ line }) => line?.quantity ?? "", 10],
    ],
  },
];

// Inclusive date range on the user's local calendar; from/to are "YYYY-MM-DD" or "".
function withinDates(timestamp, from, to) {
  const at = new Date(timestamp);
  if (from && at < new Date(`${from}T00:00:00`)) return false;
  if (to && at >= new Date(new Date(`${to}T00:00:00`).getTime() + 86400000)) return false;
  return true;
}

const reportFilters = (report) => (state.reportFilters[report.id] ??= {});
const reportCountText = (report, n) => (n === 1 ? `1 ${report.noun[0]} matches` : `${n} ${report.noun[1]} match`);

async function downloadReport(id) {
  const report = REPORTS.find((r) => r.id === id);
  const records = report.records(reportFilters(report));
  const rows = report.rows ? report.rows(records) : records;
  try {
    const XLSX = await loadSheetJS();
    const sheet = XLSX.utils.aoa_to_sheet(
      [report.columns.map(([heading]) => heading), ...rows.map((r) => report.columns.map(([, value]) => value(r)))],
      { cellDates: true, dateNF: "yyyy-mm-dd" }
    );
    sheet["!cols"] = report.columns.map(([, , wch]) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, report.title.slice(0, 31));
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    XLSX.writeFile(book, `${report.fileName}-${today}.xlsx`);
  } catch (error) {
    notify("error", `Couldn't create the ${report.title.toLowerCase()}: ${error.message}`);
  }
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

async function saveItem(form) {
  const values = Object.fromEntries(new FormData(form));
  const row = { item_code: values.item_code.trim(), name: values.name.trim() };
  if (!row.item_code || !row.name) return notify("error", "The item needs an ID and a name.");
  await saveRow(form, "items", row, row.name);
}

// Adds an item in a size to an order; if the order already has that item and size, adds to its quantity.
async function addOrderLine(form) {
  const values = Object.fromEntries(new FormData(form));
  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return notify("error", "The quantity must be a whole number of 1 or more.");
  const item = state.items.find((i) => i.id === values.item_id);
  const existing = state.orderItems.find(
    (l) => l.order_id === form.dataset.order && l.item_id === values.item_id && l.size === values.size
  );
  const { error } = existing
    ? await supabase.from("order_items").update({ quantity: existing.quantity + quantity }).eq("id", existing.id)
    : await supabase.from("order_items").insert({ order_id: form.dataset.order, item_id: values.item_id, size: values.size, quantity });
  if (error) return notify("error", `Couldn't add ${item.name}: ${error.message}`);
  state.notice = {
    type: "success",
    text: existing
      ? `Added ${quantity} more ${item.name}, size ${values.size} (now ${existing.quantity + quantity}).`
      : `Added ${quantity} × ${item.name}, size ${values.size}.`,
  };
  await loadData();
  // Ready for the next line.
  app.querySelector(`form[data-form="order-item"] select[name="item_id"]`)?.focus();
}

async function setLineQuantity(input) {
  const line = state.orderItems.find((l) => l.id === input.dataset.lineId);
  const quantity = Number(input.value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return notify("error", "The quantity must be a whole number of 1 or more. To take an item off the order, use ×.");
  }
  const { error } = await supabase.from("order_items").update({ quantity }).eq("id", line.id);
  if (error) return notify("error", `Couldn't change the quantity: ${error.message}`);
  state.notice = { type: "success", text: `Quantity changed from ${line.quantity} to ${quantity}.` };
  await loadData();
}

async function removeOrderLine(id) {
  const line = state.orderItems.find((l) => l.id === id);
  const item = state.items.find((i) => i.id === line.item_id);
  if (!confirm(`Remove ${line.quantity} × ${item.name}, size ${line.size} from this order?`)) return;
  const { data, error } = await supabase.from("order_items").delete().eq("id", id).select("id");
  if (error) return notify("error", `Couldn't remove ${item.name}: ${error.message}`);
  if (!data.length) return notify("error", `${item.name} wasn't removed. You may not have permission.`);
  state.notice = { type: "success", text: `Removed ${item.name}, size ${line.size}.` };
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
    table === "organizations" || table === "items"
      ? record.name
      : table === "orders"
        ? `order ${record.margen_order_id}`
        : fullName(record);
  // The database refuses to delete an item that orders use; say so before asking.
  if (table === "items") {
    const orders = new Set(state.orderItems.filter((l) => l.item_id === id).map((l) => l.order_id)).size;
    if (orders) {
      return notify("error", `${label} is on ${orders} order${orders === 1 ? "" : "s"}, so it can't be deleted. Remove it from those orders first.`);
    }
  }
  // Organizations and contacts are linked to each other; deleting one removes its links.
  const linked = { organizations: ["contacts", "contact"], contacts: ["organizations", "organization"] }[table];
  const links = linked ? record[linked[0]].length : 0;
  const other = linked?.[1];
  const warning = links
    ? `\n\nIts ${links} ${other} link${links === 1 ? "" : "s"} will be removed too. The ${other}s themselves are kept.`
    : "";
  const noteCount = state.notes.filter((n) => n.contact_id === id || n.athlete_id === id).length;
  const noteWarning = noteCount ? `\n\nIts ${noteCount} note${noteCount === 1 ? "" : "s"} will be deleted too.` : "";
  const lineCount = table === "orders" ? state.orderItems.filter((l) => l.order_id === id).length : 0;
  const lineWarning = lineCount ? `\n\nIts ${lineCount} item line${lineCount === 1 ? "" : "s"} will be deleted too.` : "";
  if (!confirm(`Delete ${label}? This can't be undone.${warning}${noteWarning}${lineWarning}`)) return;

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

// ---------- notes ----------

// Adds a note to the contact or athlete named on the form; the database stamps the time and author.
async function addNote(form) {
  const input = form.elements.body;
  const body = input.value.trim();
  if (!body) return;
  const subject = form.dataset.contact ? { contact_id: form.dataset.contact } : { athlete_id: form.dataset.athlete };
  input.disabled = true;
  const { error } = await supabase.from("notes").insert({ ...subject, body });
  if (error) {
    notify("error", `Couldn't save the note: ${error.message}`);
    // Keep what was typed so nothing is lost.
    const retry = app.querySelector("[data-note-input]");
    if (retry) retry.value = body;
    return;
  }
  state.notice = null;
  await loadData();
  app.querySelector("[data-note-input]")?.focus();
}

// Hides a note from this user's Dashboard; the note stays on its contact or athlete page.
async function dismissNote(id) {
  state.dismissedNotes.add(id);
  render();
  const { error } = await supabase.from("note_dismissals").insert({ note_id: id });
  // Already hidden (e.g. from another tab) is fine.
  if (error && error.code !== "23505") {
    state.dismissedNotes.delete(id);
    notify("error", `Couldn't hide the note: ${error.message}`);
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note? This can't be undone.")) return;
  const { data, error } = await supabase.from("notes").delete().eq("id", id).select("id");
  if (error) return notify("error", `Couldn't delete the note: ${error.message}`);
  if (!data.length) return notify("error", "The note wasn't deleted. You may not have permission.");
  state.notice = null;
  await loadData();
}

// ---------- views ----------

// The primary logo always sits on navy, as the brand guidelines show it.
const logo = `<img src="assets/margen-logo.svg" alt="MARGEN" class="logo">`;
const loginBrand = `
  <div class="login-brand">
    ${logo}
    <p class="tagline">For the Marine Generation</p>
  </div>`;

function loginView() {
  const notice = state.notice?.type === "error" ? `<p class="notice error">${esc(state.notice.text)}</p>` : "";
  return `
    <main class="login">
      ${loginBrand}
      <form class="card login-card" data-form="login">
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
      ${loginBrand}
      <div class="card login-card">
        <h1>No access yet</h1>
        ${detail}
        <p class="muted">${esc(state.session.user.email)} doesn't have an access level. Ask an admin to set one up.</p>
        <button type="button" data-action="signout">Sign out</button>
      </div>
    </main>`;
}

// ---------- theme ----------

// The choice is kept per browser; without one the app follows the system setting.
const THEME_KEY = "margen-theme";
const currentTheme = () => document.documentElement.dataset.theme;

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function setTheme(theme, remember) {
  if (remember) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage can be blocked; the switch still works for this visit.
    }
  }
  document.documentElement.dataset.theme = theme;
  render();
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  if (!savedTheme()) setTheme(event.matches ? "dark" : "light", false);
});

const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`;

const CHEVRON_ICON = `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

function themeToggle() {
  const dark = currentTheme() === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return `<button type="button" class="icon-btn theme-toggle" data-action="toggle-theme" aria-label="${label}" title="${label}">${
    dark ? SUN_ICON : MOON_ICON
  }</button>`;
}

function shell(page, content) {
  const tab = ({ name, label }) =>
    `<a href="#/${name}" class="tab${page === name ? " active" : ""}"${page === name ? ' aria-current="page"' : ""}>${label}</a>`;
  // Gather consecutive pages of the same group under one heading.
  const items = [];
  for (const p of visiblePages()) {
    const last = items[items.length - 1];
    if (p.group && last?.group === p.group) last.pages.push(p);
    else items.push(p.group ? { group: p.group, pages: [p] } : p);
  }
  // Groups start closed; the one holding the current page opens unless the user closed it.
  const tabs = items
    .map((item) => {
      if (!item.group) return tab(item);
      const holdsPage = item.pages.some((p) => p.name === page);
      const open = state.menuGroups[item.group] ?? holdsPage;
      const id = `menu-${item.group.toLowerCase()}`;
      return `
        <div class="tab-group${open ? " open" : ""}">
          <button type="button" class="tab-group-label${holdsPage ? " active" : ""}" data-action="toggle-group"
            data-group="${item.group}" aria-expanded="${open}" aria-controls="${id}">
            ${item.group}${CHEVRON_ICON}
          </button>
          <div class="tab-group-pages" id="${id}">${item.pages.map(tab).join("")}</div>
        </div>`;
    })
    .join("");
  const notice = state.notice
    ? `<div class="notice ${state.notice.type}" role="status">
         <span>${esc(state.notice.text)}</span>
         <button type="button" class="icon-btn" data-action="dismiss" aria-label="Dismiss">×</button>
       </div>`
    : "";
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a href="#/dashboard" class="brand" aria-label="MARGEN Dashboard home">${logo}</a>
        <nav class="tabs" aria-label="Main menu">${tabs}</nav>
        <div class="user">
          <span class="user-email">${esc(state.session.user.email)}</span>
          <div class="user-actions">
            <span class="role">${ROLE_LABELS[state.role]}</span>
            ${themeToggle()}
            <button type="button" class="ghost" data-action="signout">Sign out</button>
          </div>
        </div>
      </aside>
      <main class="page">${notice}${content}</main>
    </div>`;
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
    </div>
    ${dashboardNotes()}`;
}

// Notes this user hasn't hidden yet, newest first, each with the contact or athlete it's about.
function dashboardNotes() {
  if (!state.loaded) return "";
  const notes = state.notes.filter((n) => !state.dismissedNotes.has(n.id));
  const subjectOf = (n) =>
    n.contact_id
      ? { kind: "Contact", href: `#/contacts/${n.contact_id}`, record: state.contacts.find((c) => c.id === n.contact_id) }
      : { kind: "Athlete", href: `#/athletes/${n.athlete_id}`, record: state.athletes.find((a) => a.id === n.athlete_id) };
  const items = notes
    .map((n) => {
      const { kind, href, record } = subjectOf(n);
      return `
      <li class="note">
        <div class="note-meta">
          <span class="status tone-accent">${kind}</span>
          <a href="${href}" class="strong">${record ? esc(fullName(record)) : "Unknown"}</a>
          <time datetime="${n.created_at}">${formatDateTime(n.created_at)}</time>
          ${n.author ? `<span class="note-author">${esc(n.author.email)}</span>` : ""}
          <button type="button" class="icon-btn" data-action="dismiss-note" data-id="${n.id}"
            aria-label="Hide this note from the Dashboard" title="Hide from the Dashboard">×</button>
        </div>
        <p class="note-body">${esc(n.body)}</p>
      </li>`;
    })
    .join("");
  return `
    <section class="card section dashboard-notes">
      <h2>Notes <span class="count">${notes.length}</span></h2>
      ${
        notes.length
          ? `<ol class="notes-list">${items}</ol>`
          : `<p class="empty">No new notes. Notes added to contacts and athletes appear here until you hide them.</p>`
      }
    </section>`;
}

function reportsPage() {
  const cards = REPORTS.map((report) => {
    const values = reportFilters(report);
    const n = state.loaded ? report.records(values).length : 0;
    const fields = report
      .filters()
      .map((f) =>
        f.type === "date"
          ? `<label>${f.label}<input type="date" name="${f.name}" value="${esc(values[f.name])}"></label>`
          : f.type === "search"
          ? `<label>${f.label}<input type="search" name="${f.name}" value="${esc(values[f.name])}" placeholder="${esc(f.placeholder)}"
               autocomplete="off" list="${report.id}-${f.name}-options">
               <datalist id="${report.id}-${f.name}-options">${f.suggestions.map((s) => `<option value="${esc(s)}">`).join("")}</datalist></label>`
          : `<label>${f.label}<select name="${f.name}">${f.options
              .map(([v, text]) => `<option value="${esc(v)}"${v === (values[f.name] ?? "") ? " selected" : ""}>${esc(text)}</option>`)
              .join("")}</select></label>`
      )
      .join("");
    return `
      <section class="card section">
        <h2>${report.title}</h2>
        <p class="muted report-description">${report.description}</p>
        <form class="report-filters" data-report="${report.id}">${fields}</form>
        <div class="report-actions">
          <button type="button" class="primary" data-action="download-report" data-report="${report.id}"${n ? "" : " disabled"}>
            Download Excel
          </button>
          <span class="muted small" data-report-count="${report.id}">${state.loaded ? reportCountText(report, n) : "Loading…"}</span>
        </div>
      </section>`;
  }).join("");
  return `
    <div class="page-head">
      <div class="title-block">
        <h1>Reports</h1>
        <p class="muted">Choose filters, then download the matching data as an Excel spreadsheet.</p>
      </div>
    </div>
    <div class="stack">${cards}</div>`;
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

function listPage({ title, count, newHash, newLabel, placeholder, head, rows, panel, actions = "", filters = "" }) {
  const body = !state.loaded
    ? `<p class="empty">Loading…</p>`
    : rows
      ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
         <p class="empty no-match" hidden>No matches.</p>`
      : `<p class="empty">Nothing here yet.</p>`;
  return `
    <div class="page-head">
      <h1>${title} <span class="count">${count}</span></h1>
      ${filters}
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

// Country and State dropdowns for the Organizations list. States only list those in the chosen country.
function organizationFilters() {
  const { country, state: region } = state.orgFilters;
  const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const countries = distinct(state.organizations.map((o) => o.country));
  const states = distinct(state.organizations.filter((o) => !country || o.country === country).map((o) => o.state));
  const options = (values, selected, allLabel) =>
    `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
  return `
    <select class="filter" data-org-filter="country" aria-label="Filter by country">${options(countries, country, "All countries")}</select>
    <select class="filter" data-org-filter="state" aria-label="Filter by state">${options(states, region, "All states")}</select>`;
}

const matchesOrgFilters = (o) =>
  (!state.orgFilters.country || o.country === state.orgFilters.country) &&
  (!state.orgFilters.state || o.state === state.orgFilters.state);

function organizationsPage(id, editing) {
  const rows = state.organizations
    .map(
      (o) => `
      <tr data-href="#/organizations/${o.id}" data-search="${esc(`${o.name} ${place(o)}`.toLowerCase())}"${
        matchesOrgFilters(o) ? "" : " data-filtered-out"
      }>
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
    filters: organizationFilters(),
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
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">${notesSection("athlete", athlete.id)}</section>
    </div>`;
}

// Notes timeline for a contact or athlete (kind is "contact" or "athlete"), newest first.
function notesSection(kind, id) {
  const notes = state.notes.filter((n) => n[`${kind}_id`] === id);
  const items = notes
    .map(
      (n) => `
      <li class="note">
        <div class="note-meta">
          <time datetime="${n.created_at}">${formatDateTime(n.created_at)}</time>
          ${n.author ? `<span class="note-author">${esc(n.author.email)}</span>` : ""}
          <button type="button" class="icon-btn" data-action="delete-note" data-id="${n.id}" aria-label="Delete note" title="Delete note">×</button>
        </div>
        <p class="note-body">${esc(n.body)}</p>
      </li>`
    )
    .join("");
  return `
    <h2>Notes <span class="count">${notes.length}</span></h2>
    <form data-form="note" data-${kind}="${id}" class="note-form">
      <textarea name="body" rows="2" data-note-input aria-label="New note"
        placeholder="Add a note: a call, a conversation, something to remember…"></textarea>
      <p class="muted small">Press Enter to save. Shift+Enter starts a new line.</p>
    </form>
    ${notes.length ? `<ol class="notes-list">${items}</ol>` : `<p class="empty">No notes yet.</p>`}`;
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
        <td class="num hide-sm">${piecesIn(o.id) || dash}</td>
      </tr>`
    )
    .join("");

  return listPage({
    title: "Customs",
    count: state.orders.length,
    newHash: "#/customs/new",
    newLabel: "New order",
    placeholder: "Search orders",
    head: `<th>Margen order ID</th><th class="hide-sm">Factory order ID</th><th class="hide-sm">Organization</th><th>Order status</th><th>Production</th><th class="num hide-sm">Pieces</th>`,
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
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">${orderLines(order, editing)}</section>
      <section class="card section span-all">${auditTrail(order.id)}</section>
    </div>`;
}

// What the order is made of: one line per item and size, with its quantity.
// Read-only unless the order is being edited (#/customs/<id>/edit).
function orderLines(order, editing) {
  const lines = orderLinesOf(order.id);
  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td><a href="#/items/${l.item.id}" class="strong">${esc(l.item.name)}</a></td>
        <td>${esc(l.size)}</td>
        ${
          editing
            ? `<td class="num"><input type="number" class="qty" min="1" step="1" value="${l.quantity}" data-line-id="${l.id}"
                 aria-label="Quantity of ${esc(l.item.name)}, size ${esc(l.size)}"></td>
               <td class="num"><button type="button" class="icon-btn" data-action="remove-line" data-id="${l.id}"
                 aria-label="Remove ${esc(l.item.name)}, size ${esc(l.size)}" title="Remove from order">×</button></td>`
            : `<td class="num">${l.quantity}</td>`
        }
      </tr>`
    )
    .join("");
  const table = `
    <div class="table-wrap${editing ? " editing" : ""}"><table class="static">
      <thead><tr><th>Item</th><th>Size</th><th class="num">Qty</th>${editing ? `<th><span class="sr-only">Remove</span></th>` : ""}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="num">${total}</td>${editing ? "<td></td>" : ""}</tr></tfoot>
    </table></div>`;

  if (!editing) {
    return `
      <h2>Items <span class="count">${total}</span></h2>
      ${rows ? table : `<p class="empty">No items on this order yet. Click Edit to add some.</p>`}`;
  }

  const addForm = state.items.length
    ? `<form data-form="order-item" data-order="${order.id}" class="line-form">
         <select name="item_id" required aria-label="Item">
           <option value="">Choose an item…</option>
           ${state.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}
         </select>
         <select name="size" required aria-label="Size"><option value="">Size</option>${sizeOptions()}</select>
         <input type="number" name="quantity" min="1" step="1" required placeholder="Qty" aria-label="Quantity" class="qty">
         <button type="submit" class="primary">Add</button>
       </form>`
    : `<p class="muted small">No items yet. <a href="#/items/new">Add an item</a> first.</p>`;
  return `
    <h2>Items <span class="count">${total}</span></h2>
    ${rows ? table : `<p class="empty">No items on this order yet.</p>`}
    ${addForm}
    <p class="muted small">Item changes are saved as you make them.</p>`;
}

function itemForm(item) {
  const back = item ? `#/items/${item.id}` : "#/items";
  return `
    ${panelHead(item ? "Edit item" : "New item", back)}
    <form data-form="item"${item ? ` data-id="${item.id}"` : ""} class="stack">
      <label>Item ID<input name="item_code" required autofocus autocomplete="off" class="mono" value="${esc(item?.item_code)}" placeholder="e.g. WMN-RACERBACK"></label>
      <label>Name<input name="name" required autocomplete="off" value="${esc(item?.name)}" placeholder="e.g. Women's Racerback"></label>
      ${formButtons(item ? "Save changes" : "Create item", back)}
    </form>`;
}

function itemsPage(id, editing) {
  if (id && id !== "new") {
    const item = state.items.find((i) => i.id === id);
    if (item) return itemPage(item, editing);
    return `
      <a href="#/items" class="back">← Items</a>
      <section class="card"><p class="empty">${state.loaded ? "This item doesn't exist or was deleted." : "Loading…"}</p></section>`;
  }

  const rows = state.items
    .map((i) => {
      const lines = state.orderItems.filter((l) => l.item_id === i.id);
      const orders = new Set(lines.map((l) => l.order_id)).size;
      const pieces = lines.reduce((sum, l) => sum + l.quantity, 0);
      return `
      <tr data-href="#/items/${i.id}" data-search="${esc(`${i.item_code} ${i.name}`.toLowerCase())}">
        <td><a href="#/items/${i.id}" class="strong mono">${esc(i.item_code)}</a></td>
        <td>${esc(i.name)}</td>
        <td class="num hide-sm">${orders || dash}</td>
        <td class="num">${pieces || dash}</td>
      </tr>`;
    })
    .join("");

  return listPage({
    title: "Items",
    count: state.items.length,
    newHash: "#/items/new",
    newLabel: "New item",
    placeholder: "Search items",
    head: `<th>Item ID</th><th>Name</th><th class="num hide-sm">Orders</th><th class="num">Pieces ordered</th>`,
    rows,
    panel: id === "new" ? itemForm() : "",
  });
}

function itemPage(item, editing) {
  const details = editing
    ? itemForm(item)
    : `
      <h2>Details</h2>
      <dl class="details">
        <div><dt>Item ID</dt><dd class="mono">${esc(item.item_code)}</dd></div>
        <div><dt>Name</dt><dd>${esc(item.name)}</dd></div>
        <div><dt>Added</dt><dd>${formatDate(item.created_at)}</dd></div>
      </dl>`;

  return `
    <a href="#/items" class="back">← Items</a>
    <div class="page-head">
      <div class="title-block">
        <h1>${esc(item.name)}</h1>
        <p class="muted mono">${esc(item.item_code)}</p>
      </div>
      ${
        editing
          ? ""
          : `<a href="#/items/${item.id}/edit" class="button">Edit</a>
             <button type="button" class="danger" data-action="delete" data-table="items" data-id="${item.id}">Delete</button>`
      }
    </div>
    <div class="detail-grid">
      <section class="card section">${details}</section>
      <section class="card section">${itemOrders(item)}</section>
    </div>`;
}

// The orders this item is on, with how many of each size.
function itemOrders(item) {
  const orders = state.orders
    .map((o) => ({
      order: o,
      lines: state.orderItems
        .filter((l) => l.order_id === o.id && l.item_id === item.id)
        .sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size)),
    }))
    .filter((o) => o.lines.length);
  const rows = orders
    .map(
      ({ order, lines }) => `
      <tr>
        <td><a href="#/customs/${order.id}" class="strong mono">${esc(order.margen_order_id)}</a></td>
        <td>${lines.map((l) => `${esc(l.size)}&nbsp;<span class="muted">×</span>&nbsp;${l.quantity}`).join(" · ")}</td>
        <td class="num">${lines.reduce((sum, l) => sum + l.quantity, 0)}</td>
      </tr>`
    )
    .join("");
  return `
    <h2>Orders <span class="count">${orders.length}</span></h2>
    ${
      rows
        ? `<div class="table-wrap"><table class="static">
             <thead><tr><th>Order</th><th>Sizes</th><th class="num">Pieces</th></tr></thead>
             <tbody>${rows}</tbody>
           </table></div>`
        : `<p class="empty">Not on any order yet.</p>`
    }`;
}

// Fields the order_events trigger records, in the order they're listed.
const AUDIT_FIELDS = {
  margen_order_id: "Margen order ID",
  factory_order_id: "Factory order ID",
  organization: "Organization",
  order_status: "Order status",
  production_status: "Production status",
};
const AUDIT_ACTIONS = {
  created: "Created",
  updated: "Changed",
  deleted: "Deleted",
  item_added: "Item added",
  item_changed: "Item changed",
  item_removed: "Item removed",
};

// Change lines for an item_added / item_changed / item_removed event.
function auditLineChanges(e) {
  const { item, size, quantity } = e.changes;
  if (e.action !== "item_changed") {
    const side = e.action === "item_added" ? "to" : "from";
    return `<li>${esc(item[side])}, size ${esc(size[side])} <span class="muted">×</span> ${quantity[side]}</li>`;
  }
  const diff = (label, { from, to }) =>
    from === to ? "" : `<li><span class="muted">${label}:</span> ${esc(from)} <span class="muted">→</span> ${esc(to)}</li>`;
  return `<li>${esc(item.from)}, size ${esc(size.from)}</li>${diff("Item", item)}${diff("Size", size)}${diff("Quantity", quantity)}`;
}

function auditValue(field, value) {
  if (field === "order_status") return ORDER_STATUSES[value] ?? value;
  if (field === "production_status") return value ? PRODUCTION_STATUSES[value] ?? value : "Not started";
  return value ?? "None";
}

function auditTrail(orderId) {
  const events = state.orderEvents.filter((e) => e.order_id === orderId);
  const items = events
    .map((e) => {
      const changes = e.action.startsWith("item_")
        ? auditLineChanges(e)
        : Object.keys(AUDIT_FIELDS)
        .filter((field) => field in e.changes)
        .map((field) => {
          const { from, to } = e.changes[field];
          const value =
            e.action === "created"
              ? esc(auditValue(field, to))
              : `${esc(auditValue(field, from))} <span class="muted">→</span> ${esc(auditValue(field, to))}`;
          return `<li><span class="muted">${AUDIT_FIELDS[field]}:</span> ${value}</li>`;
        })
        .join("");
      return `
        <li class="note audit-event">
          <div class="note-meta">
            <time datetime="${e.changed_at}">${formatDateTime(e.changed_at)}</time>
            <span class="note-author">${e.author ? esc(e.author.email) : "System"}</span>
          </div>
          <p class="note-body strong">${AUDIT_ACTIONS[e.action]}</p>
          ${changes ? `<ul class="audit-changes">${changes}</ul>` : ""}
        </li>`;
    })
    .join("");
  return `
    <h2>Order history <span class="count">${events.length}</span></h2>
    ${events.length ? `<ol class="notes-list">${items}</ol>` : `<p class="empty">No changes recorded yet.</p>`}`;
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
      <section class="card section span-all">${notesSection("contact", contact.id)}</section>
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
    items: () => itemsPage(id, editing),
    organizations: () => organizationsPage(id, editing),
    contacts: () => contactsPage(id, editing),
    athletes: () => athletesPage(id, editing),
    leads: () => leadsPage(id, editing),
    reports: () => reportsPage(),
    users: () => usersPage(),
  }[page]();
  app.innerHTML = shell(page, content);
  applySearch();
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
    case "item":
      await saveItem(form);
      break;
    case "order-item":
      await addOrderLine(form);
      break;
    case "lead":
      await saveLead(form);
      break;
    case "note":
      await addNote(form);
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
      case "dismiss-note":
        await dismissNote(action.dataset.id);
        break;
      case "delete-note":
        await deleteNote(action.dataset.id);
        break;
      case "remove-line":
        await removeOrderLine(action.dataset.id);
        break;
      case "download-report":
        action.disabled = true;
        await downloadReport(action.dataset.report);
        if (action.isConnected) action.disabled = false;
        break;
      case "toggle-group":
        state.menuGroups[action.dataset.group] = action.getAttribute("aria-expanded") !== "true";
        render();
        app.querySelector(`[data-action="toggle-group"][data-group="${action.dataset.group}"]`)?.focus();
        break;
      case "toggle-theme":
        setTheme(currentTheme() === "dark" ? "light" : "dark", true);
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
  if (event.target.closest("form[data-report]")) return updateReportFilter(event.target);
  if (event.target.matches("select[data-org-filter]")) {
    const field = event.target.dataset.orgFilter;
    state.orgFilters[field] = event.target.value;
    // A state that isn't in the newly chosen country no longer applies.
    if (field === "country" && state.orgFilters.state) {
      const stillThere = state.organizations.some(
        (o) => o.state === state.orgFilters.state && (!event.target.value || o.country === event.target.value)
      );
      if (!stillThere) state.orgFilters.state = "";
    }
    // Re-render to refresh the State choices, keeping what was typed in the search box.
    const query = app.querySelector(".search")?.value ?? "";
    render();
    const search = app.querySelector(".search");
    if (search) search.value = query;
    applySearch();
    app.querySelector(`select[data-org-filter="${field}"]`)?.focus();
    return;
  }
  if (event.target.matches("input[data-line-id]")) {
    event.target.disabled = true;
    await setLineQuantity(event.target);
    return;
  }
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

// In the note box, Enter saves the note and Shift+Enter adds a line break.
app.addEventListener("keydown", (event) => {
  if (!event.target.matches("[data-note-input]")) return;
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!event.target.disabled) event.target.form.requestSubmit();
});

// Filter rows in place so the search box keeps focus while typing.
// Rows left out by a list's filters (data-filtered-out) stay hidden whatever the search says.
function applySearch() {
  const query = app.querySelector(".search")?.value.trim().toLowerCase() ?? "";
  const rows = [...app.querySelectorAll("tr[data-search]")];
  rows.forEach((row) => (row.hidden = row.hasAttribute("data-filtered-out") || !row.dataset.search.includes(query)));
  const noMatch = app.querySelector(".no-match");
  if (noMatch) noMatch.hidden = rows.some((row) => !row.hidden);
}

// Updates a report's match count and button in place, so focus stays in the filters.
function updateReportFilter(field) {
  const report = REPORTS.find((r) => r.id === field.form.dataset.report);
  reportFilters(report)[field.name] = field.value;
  const n = report.records(reportFilters(report)).length;
  app.querySelector(`[data-report-count="${report.id}"]`).textContent = reportCountText(report, n);
  app.querySelector(`[data-action="download-report"][data-report="${report.id}"]`).disabled = !n;
}

app.addEventListener("input", (event) => {
  if (event.target.matches(".search")) applySearch();
  // Typed report filters (order ID search) update the count as you type.
  else if (event.target.matches("form[data-report] input[type=search]")) updateReportFilter(event.target);
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
