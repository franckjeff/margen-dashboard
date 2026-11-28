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

// Must match the check constraint on tasks.status.
export const TASK_STATUSES: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};
export const TASK_TONES: Record<string, string> = { todo: "muted", in_progress: "yellow", done: "success" };

// Must match the check constraints on orders.order_status and orders.production_status.
export const ORDER_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  in_production: "In production",
  shipped: "Shipped",
  cancelled: "Cancelled",
};
export const PRODUCTION_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  artwork_in_progress: "Artwork in progress",
  in_printing_queue: "In printing queue",
  sewing: "Sewing",
  trimming: "Trimming",
  shipped: "Shipped",
};
// Orders still being worked on, as opposed to shipped or cancelled.
export const OPEN_ORDER_STATUSES = ["received", "accepted", "in_production"];
// An archived order doesn't count as open, whatever its status.
export const isOpenOrder = (o: { order_status: string; archived_at: string | null }) =>
  !o.archived_at && OPEN_ORDER_STATUSES.includes(o.order_status);
export const ORDER_TONES: Record<string, string> = {
  received: "orange",
  accepted: "yellow",
  in_production: "yellow",
  shipped: "success",
  cancelled: "danger",
};
// The order pages in the menu, and the order statuses each one lists. Cancelled orders and archived
// ones (whatever their status) are on Cancelled & Archived instead.
export type OrderList = "customs" | "production-orders" | "shipped-orders";
export const ORDER_LISTS: Record<OrderList, string[]> = {
  customs: ["received", "accepted"],
  "production-orders": ["in_production"],
  "shipped-orders": ["shipped"],
};
// The page an order is listed on.
export const orderListOf = (o: { order_status: string; archived_at: string | null }): OrderList | "archived-orders" =>
  o.archived_at || o.order_status === "cancelled"
    ? "archived-orders"
    : ((Object.keys(ORDER_LISTS) as OrderList[]).find((l) => ORDER_LISTS[l].includes(o.order_status)) ?? "customs");
export const productionLabel = (status: string | null) => (status ? PRODUCTION_STATUSES[status] : "Not started");

// Must match the check constraint on order_items.size. Adult sizes, then junior, in display order.
export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
export const JUNIOR_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16"];
export const SIZES = [...ADULT_SIZES, ...JUNIOR_SIZES];

// A contact's delivery address, and its billing address when that isn't the same.
export const ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "state", "postal_code", "country"] as const;
export const BILLING_FIELDS = [
  "billing_address_line1",
  "billing_address_line2",
  "billing_city",
  "billing_state",
  "billing_postal_code",
  "billing_country",
] as const;
// The contact columns for its phone and addresses.
export const CONTACT_DETAIL_COLUMNS = ["phone", "whatsapp", "billing_same_as_delivery", ...ADDRESS_FIELDS, ...BILLING_FIELDS].join(", ");
// The lead form's optional text fields. Its Message (leads.notes) is what they wrote with a quote request, shown but not edited.
export const LEAD_TEXT_FIELDS = ["organization_name", "email", "phone", "state", "country", "source"] as const;

export type PageName =
  | "dashboard"
  | "tasks"
  | "customs"
  | "production-orders"
  | "shipped-orders"
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
  | "email-settings"
  | "emails"
  | "my-contacts"
  | "guide"
  | "status-colors";

// A page with a heading sits under that heading inside its group (e.g. Admin > Email > Settings).
export type Page = { name: PageName; label: string; roles: Role[]; group?: string; heading?: string };

// Menu order, and which roles see each page. The first visible page is the home page.
// Hiding a page here is only cosmetic: the database's access rules are what protect the data.
export const PAGES: Page[] = [
  { name: "dashboard", label: "Dashboard", roles: ["admin", "factory", "client"] },
  // To-dos admins give each other and factory users. Factory users see only theirs.
  { name: "tasks", label: "Tasks", roles: ["admin", "factory"] },
  // Consecutive pages with the same group sit under that heading in the menu.
  // Factory users see only the orders assigned to their factory; client users only their organization's.
  // Orders are listed by order status: new ones (received or accepted), those in production, and shipped
  // ones. Each order opens at #/customs/<id>.
  { name: "customs", label: "New", roles: ["admin", "factory", "client"], group: "Custom Orders" },
  { name: "production-orders", label: "In Production", roles: ["admin", "factory", "client"], group: "Custom Orders" },
  { name: "shipped-orders", label: "Shipped", roles: ["admin", "factory", "client"], group: "Custom Orders" },
  // Cancelled orders, and orders an admin has archived whatever their status; they leave the other pages.
  { name: "archived-orders", label: "Cancelled & Archived", roles: ["admin", "factory", "client"], group: "Custom Orders" },
  // Signed-in clients send orders with items and sizes here; admins can send one for a client.
  { name: "order", label: "Submit an order", roles: ["admin", "client"], group: "Custom Orders" },
  // Orders sent from the Order Entry page (#/order), waiting to be turned into orders.
  { name: "order-requests", label: "Order requests", roles: ["admin"], group: "Custom Orders" },
  { name: "items", label: "Items", roles: ["admin"], group: "Custom Orders" },
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
  // How the app sends emails, and the log of every email it sent.
  { name: "email-settings", label: "Settings", roles: ["admin"], group: "Admin", heading: "Email" },
  { name: "emails", label: "Logs", roles: ["admin"], group: "Admin", heading: "Email" },
  // The colour of each status badge, for everyone.
  { name: "status-colors", label: "Status colors", roles: ["admin"], group: "Admin" },
  // How the app works: a guide for admins, one for factory users and one for client users; admins can read all three.
  { name: "guide", label: "User guide", roles: ["admin", "factory", "client"] },
];

export const visiblePages = (role: Role) => PAGES.filter((p) => p.roles.includes(role));
