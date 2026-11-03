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
export const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"];

// Must match the check constraints on orders.order_status and orders.production_status.
export const ORDER_STATUSES: Record<string, string> = {
  received: "Received",
  accepted: "Accepted",
  on_hold: "On hold",
  cancelled: "Cancelled",
  closed: "Closed",
};
export const PRODUCTION_STATUSES: Record<string, string> = {
  job_sheet_approved: "Job sheet approved",
  artwork_in_progress: "Artwork in progress",
  in_printing_queue: "In printing queue",
  sewing: "Sewing",
  trimming: "Trimming",
  shipped: "Shipped",
};
// Orders still being worked on, as opposed to cancelled or closed.
export const OPEN_ORDER_STATUSES = ["received", "accepted", "on_hold"];
export const ORDER_TONES: Record<string, string> = {
  received: "accent",
  accepted: "accent",
  on_hold: "warn",
  cancelled: "muted",
  closed: "success",
};
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
  | "items"
  | "factories"
  | "athletes"
  | "leads"
  | "organizations"
  | "contacts"
  | "reports"
  | "users";

export type Page = { name: PageName; label: string; roles: Role[]; group?: string };

// Menu order, and which roles see each page. The first visible page is the home page.
// Hiding a page here is only cosmetic: the database's access rules are what protect the data.
export const PAGES: Page[] = [
  { name: "dashboard", label: "Dashboard", roles: ["admin", "factory", "client"] },
  // Consecutive pages with the same group sit under that heading in the menu.
  // Factory users see only the orders assigned to their factory.
  { name: "customs", label: "Orders", roles: ["admin", "factory"], group: "Customs" },
  { name: "items", label: "Items", roles: ["admin"], group: "Customs" },
  { name: "factories", label: "Factories", roles: ["admin"], group: "Customs" },
  { name: "athletes", label: "Athletes", roles: ["admin"] },
  { name: "leads", label: "Leads", roles: ["admin"], group: "Clients" },
  { name: "organizations", label: "Organizations", roles: ["admin"], group: "Clients" },
  { name: "contacts", label: "Contacts", roles: ["admin"], group: "Clients" },
  { name: "reports", label: "Reports", roles: ["admin"] },
  { name: "users", label: "Users", roles: ["admin"] },
];

export const visiblePages = (role: Role) => PAGES.filter((p) => p.roles.includes(role));
