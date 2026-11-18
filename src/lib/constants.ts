// Must match the check constraint on profiles.role.
export type Role = "admin" | "factory" | "client";
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", factory: "Factory", client: "Client" };

// Must match the check constraint on leads.status.
export const LEAD_STATUSES: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};
// Must match the open leads counted by the dashboard_counts database function.
export const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"];

// Must match the check constraints on orders.order_status and orders.production_status.
export const ORDER_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  in_production: "In production",
  done: "Done",
  on_hold: "On hold",
  cancelled: "Cancelled",
};
export const PRODUCTION_STATUSES: Record<string, string> = {
  artwork_in_progress: "Artwork in progress",
  in_printing_queue: "In printing queue",
  sewing: "Sewing",
  trimming: "Trimming",
  shipped: "Shipped",
};
// Orders still being worked on, as opposed to done or cancelled.
export const OPEN_ORDER_STATUSES = ["received", "accepted", "in_production", "on_hold"];
// An archived order doesn't count as open, whatever its status.
export const isOpenOrder = (o: { order_status: string; archived_at: string | null }) =>
  !o.archived_at && OPEN_ORDER_STATUSES.includes(o.order_status);
export const ORDER_TONES: Record<string, string> = {
  received: "orange",
  accepted: "yellow",
  in_production: "yellow",
  done: "success",
  on_hold: "warn",
  cancelled: "danger",
};
// The grids on the Orders page, top to bottom, and the order statuses each one holds.
export const ORDER_GRIDS: { key: string; title: string; statuses: string[] }[] = [
  { key: "new", title: "Pre-Production", statuses: ["received", "accepted", "on_hold"] },
  { key: "in_production", title: "In production", statuses: ["in_production"] },
  { key: "done", title: "Done", statuses: ["done"] },
  { key: "cancelled", title: "Cancelled", statuses: ["cancelled"] },
];
export const productionLabel = (status: string | null) => (status ? PRODUCTION_STATUSES[status] : "Not started");

// Must match the check constraint on order_items.size. Adult sizes, then junior, in display order.
export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
export const JUNIOR_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16"];
export const SIZES = [...ADULT_SIZES, ...JUNIOR_SIZES];

export const ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "state", "postal_code", "country"] as const;
export const LEAD_TEXT_FIELDS = ["organization_name", "email", "phone", "state", "country", "source", "notes"] as const;

export type PageName =
  | "dashboard"
  | "customs"
  | "order"
  | "archived-orders"
  | "order-requests"
  | "items"
  | "factories"
  | "athletes"
  | "leads"
  | "organizations"
  | "contacts"
  | "reports"
  | "users"
  | "emails"
  | "my-contacts"
  | "guide"
  | "status-colors";

export type Page = { name: PageName; label: string; roles: Role[]; group?: string };

// Menu order, and which roles see each page. The first visible page is the home page.
// Hiding a page here is only cosmetic: the database's access rules are what protect the data.
export const PAGES: Page[] = [
  { name: "dashboard", label: "Dashboard", roles: ["admin", "factory", "client"] },
  // Consecutive pages with the same group sit under that heading in the menu.
  // Factory users see only the orders assigned to their factory; client users only their organization's.
  { name: "customs", label: "Orders in progress", roles: ["admin", "factory", "client"], group: "Customs" },
  // Orders an admin has archived, whatever their status; they leave the Orders page.
  { name: "archived-orders", label: "Archived orders", roles: ["admin", "factory", "client"], group: "Customs" },
  // Signed-in clients send orders with items and sizes here; admins can send one for a client.
  { name: "order", label: "Place an order", roles: ["admin", "client"], group: "Customs" },
  // Orders sent from the Order Entry page (#/order), waiting to be turned into orders.
  { name: "order-requests", label: "Order requests", roles: ["admin"], group: "Customs" },
  { name: "items", label: "Items", roles: ["admin"], group: "Customs" },
  // Factory and client users' own contacts; the default one gets the app's emails.
  { name: "my-contacts", label: "Contacts", roles: ["factory", "client"] },
  { name: "leads", label: "Leads", roles: ["admin"] },
  // Contacts belong to organizations and factories alike, so they sit outside the groups.
  { name: "contacts", label: "Contacts", roles: ["admin"] },
  { name: "athletes", label: "Athletes", roles: ["admin"] },
  { name: "reports", label: "Reporting", roles: ["admin"] },
  { name: "factories", label: "Factories", roles: ["admin"], group: "Admin" },
  { name: "organizations", label: "Organizations", roles: ["admin"], group: "Admin" },
  { name: "users", label: "Users", roles: ["admin"], group: "Admin" },
  { name: "emails", label: "Email log", roles: ["admin"], group: "Admin" },
  // The colour of each status badge, for everyone.
  { name: "status-colors", label: "Status colors", roles: ["admin"], group: "Admin" },
  // How the app works, written for factory or client users; admins can read either version.
  { name: "guide", label: "User guide", roles: ["admin", "factory", "client"] },
];

export const visiblePages = (role: Role) => PAGES.filter((p) => p.roles.includes(role));
