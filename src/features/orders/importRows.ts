import type { Order, Organization } from "../../data/queries";
import { ORDER_STATUSES, PRODUCTION_STATUSES } from "../../lib/constants";

export type ImportField = "margen_order_id" | "factory_order_id" | "organization" | "order_status" | "production_status";
export type OrderChange = Partial<Pick<Order, "factory_order_id" | "organization_id" | "order_status" | "production_status">>;

// Headings each order field accepts, compared without case, spaces or punctuation.
export const IMPORT_COLUMNS: Record<ImportField, string[]> = {
  margen_order_id: ["margenorderid", "margenid", "margenorder"],
  factory_order_id: ["factoryorderid", "factoryid", "factoryorder"],
  organization: ["organization", "organisation", "org", "client"],
  order_status: ["orderstatus", "status"],
  production_status: ["productionstatus", "production"],
};
const FIELDS = Object.keys(IMPORT_COLUMNS) as ImportField[];

export const IMPORT_TEMPLATE = [
  ["Margen order ID", "Factory order ID", "Organization", "Order status", "Production status"],
  ["2026_1_OUTRIGGER", "RKU12060-M", "Outrigger Canoe Club", "Accepted", "Sewing"],
];

export const CHANGE_LABELS: Record<keyof OrderChange, string> = {
  factory_order_id: "factory ID",
  organization_id: "organization",
  order_status: "order status",
  production_status: "production",
};

export type RawRow = { line: number } & Record<ImportField, string>;
export type CheckedRow = RawRow & {
  errors: string[];
  change: OrderChange;
  existing?: Order;
  action: "new" | "update" | "same" | "error";
};

const squash = (text: unknown) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

// Status key for a cell such as "On hold", "on_hold" or "ON HOLD"; undefined if it isn't one.
export const parseStatus = (labels: Record<string, string>, text: string) =>
  Object.keys(labels).find((key) => squash(key) === squash(text) || squash(labels[key]) === squash(text));

// Turns a sheet's rows (headings first) into rows keyed by order field. Throws a readable
// message when the sheet can't be used.
export function sheetToRows(table: string[][], fileName: string): RawRow[] {
  const [headings = [], ...lines] = table;
  const columns: Partial<Record<ImportField, number>> = {};
  headings.forEach((heading, index) => {
    const field = FIELDS.find((f) => IMPORT_COLUMNS[f].includes(squash(heading)));
    if (field && !(field in columns)) columns[field] = index;
  });
  if (!("margen_order_id" in columns)) {
    throw new Error(`${fileName} has no "Margen order ID" column. Download the template to see the expected columns.`);
  }
  const rows = lines
    .map((cells, index) => ({
      line: index + 2, // spreadsheet row number, counting the heading row
      ...(Object.fromEntries(
        FIELDS.map((f) => [f, columns[f] !== undefined ? String(cells[columns[f]!] ?? "").trim() : ""]),
      ) as Record<ImportField, string>),
    }))
    .filter((row) => FIELDS.some((f) => row[f]));
  if (!rows.length) throw new Error(`${fileName} has no orders in it.`);
  return rows;
}

// Works out what each row would do: add an order, update the order with the same
// Margen order ID (only the filled-in cells), change nothing, or be skipped for errors.
export function checkImportRows(raw: RawRow[], orders: Order[], organizations: Organization[]): CheckedRow[] {
  const seenMargen = new Set<string>();
  const seenFactory = new Set<string>();
  return raw.map((row) => {
    const errors: string[] = [];
    const change: OrderChange = {};
    const existing = orders.find((o) => o.margen_order_id === row.margen_order_id);

    if (!row.margen_order_id) errors.push("Margen order ID is missing");
    else if (seenMargen.has(row.margen_order_id)) errors.push("Margen order ID is in the file twice");
    seenMargen.add(row.margen_order_id);

    if (row.factory_order_id) {
      const owner = orders.find((o) => o.factory_order_id === row.factory_order_id);
      if (seenFactory.has(row.factory_order_id)) errors.push("Factory order ID is in the file twice");
      else if (owner && owner !== existing) errors.push(`Factory order ID is already used by ${owner.margen_order_id}`);
      seenFactory.add(row.factory_order_id);
      change.factory_order_id = row.factory_order_id;
    }
    if (row.organization) {
      const org = organizations.find((o) => sameName(o.name, row.organization));
      if (org) change.organization_id = org.id;
      else errors.push(`No organization called "${row.organization}"`);
    }
    if (row.order_status) {
      const status = parseStatus(ORDER_STATUSES, row.order_status);
      if (status) change.order_status = status;
      else errors.push(`"${row.order_status}" isn't an order status`);
    }
    if (row.production_status) {
      const status = squash(row.production_status) === "notstarted" ? null : parseStatus(PRODUCTION_STATUSES, row.production_status);
      if (status !== undefined) change.production_status = status;
      else errors.push(`"${row.production_status}" isn't a production status`);
    }

    if (existing) {
      for (const field of Object.keys(change) as (keyof OrderChange)[]) {
        if (change[field] === existing[field]) delete change[field];
      }
    }
    const action = errors.length ? "error" : !existing ? "new" : Object.keys(change).length ? "update" : "same";
    return { ...row, errors, change, existing, action };
  });
}
