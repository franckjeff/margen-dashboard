import type { Factory, Item, Order, OrderLine, Organization } from "../../data/queries";
import { ORDER_STATUSES, PRODUCTION_STATUSES, productionLabel } from "../../lib/constants";
import { orderLinesOf, piecesIn, type LineWithItem } from "../orders/lines";

export type ReportData = { orders: Order[]; organizations: Organization[]; factories: Factory[]; orderItems: OrderLine[]; items: Item[] };
export type FilterValues = Record<string, string>; // "" or missing means all

export type Filter =
  | { name: string; label: string; type: "select"; options: [value: string, label: string][] }
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "search"; placeholder: string; suggestions: string[] };

// One spreadsheet column: heading, how a row becomes the cell's value, and the column width.
type Column<R> = [heading: string, value: (row: R) => string | number | Date, width: number];

export type Report<R = unknown> = {
  id: string;
  title: string;
  description: string;
  noun: [one: string, many: string];
  fileName: string;
  filters: (data: ReportData) => Filter[];
  // Which orders match the filters; each becomes one or more spreadsheet rows (rows).
  records: (filters: FilterValues, data: ReportData) => Order[];
  rows: (orders: Order[], data: ReportData) => R[];
  columns: Column<R>[];
};

// Inclusive date range on the user's local calendar; from/to are "YYYY-MM-DD" or "".
export function withinDates(timestamp: string, from?: string, to?: string) {
  const at = new Date(timestamp);
  if (from && at < new Date(`${from}T00:00:00`)) return false;
  if (to && at >= new Date(new Date(`${to}T00:00:00`).getTime() + 86400000)) return false;
  return true;
}

// A "YYYY-MM-DD" day as a spreadsheet date on that same day, or an empty cell.
const sheetDay = (day: string | null) => (day ? new Date(`${day}T00:00:00`) : "");

const shippingColumns = <R>(orderOf: (row: R) => Order): Column<R>[] => [
  ["Estimated shipping date", (r) => sheetDay(orderOf(r).estimated_ship_date), 14],
  ["Actual shipping date", (r) => sheetDay(orderOf(r).actual_ship_date), 14],
  ["Shipping method", (r) => orderOf(r).shipping_method ?? "", 20],
  ["Tracker", (r) => orderOf(r).tracking_number ?? "", 24],
];

const orderReport: Report<Order & { pieces: number }> = {
  id: "orders",
  title: "Order report",
  description: "Every order with its IDs, organization, factory, statuses, shipping details and date added.",
  noun: ["order", "orders"],
  fileName: "margen-order-report",
  filters: ({ organizations, factories }) => [
    {
      name: "organization_id",
      label: "Organization",
      type: "select",
      options: [
        ["", "All organizations"],
        ...organizations.map((o): [string, string] => [o.id, o.name]).sort((a, b) => a[1].localeCompare(b[1])),
        ["none", "No organization"],
      ],
    },
    {
      name: "factory_id",
      label: "Factory",
      type: "select",
      options: [["", "All factories"], ...factories.map((f): [string, string] => [f.id, f.name]), ["none", "Not assigned"]],
    },
    { name: "order_status", label: "Order status", type: "select", options: [["", "All order statuses"], ...Object.entries(ORDER_STATUSES)] },
    {
      name: "production_status",
      label: "Production status",
      type: "select",
      options: [["", "All production statuses"], ["not_started", "Not started"], ...Object.entries(PRODUCTION_STATUSES)],
    },
    { name: "from", label: "Added from", type: "date" },
    { name: "to", label: "Added to", type: "date" },
  ],
  records: (f, { orders }) =>
    orders.filter(
      (o) =>
        (!f.organization_id || (f.organization_id === "none" ? !o.organization_id : o.organization_id === f.organization_id)) &&
        (!f.factory_id || (f.factory_id === "none" ? !o.factory_id : o.factory_id === f.factory_id)) &&
        (!f.order_status || o.order_status === f.order_status) &&
        (!f.production_status || (o.production_status ?? "not_started") === f.production_status) &&
        withinDates(o.created_at, f.from, f.to),
    ),
  rows: (orders, { orderItems }) => orders.map((o) => ({ ...o, pieces: piecesIn(orderItems, o.id) })),
  columns: [
    ["Margen order ID", (o) => o.margen_order_id, 22],
    ["Factory order ID", (o) => o.factory_order_id ?? "", 18],
    ["Organization", (o) => o.organization?.name ?? "", 30],
    ["Factory", (o) => o.factory?.name ?? "", 24],
    ["Order status", (o) => ORDER_STATUSES[o.order_status], 14],
    ["Production status", (o) => productionLabel(o.production_status), 20],
    ...shippingColumns<Order & { pieces: number }>((o) => o),
    ["Pieces", (o) => o.pieces, 10],
    ["Added", (o) => new Date(o.created_at), 14],
  ],
};

type DetailRow = { order: Order; line: LineWithItem | null };

const orderDetailReport: Report<DetailRow> = {
  id: "order_detail",
  title: "Order detail report",
  description:
    "Orders with all their details and every item ordered: one row per item and size. Search for an order ID, or leave it empty for every order.",
  noun: ["order", "orders"],
  fileName: "margen-order-detail",
  filters: ({ orders }) => [
    {
      name: "order",
      label: "Order ID",
      type: "search",
      placeholder: "Margen or factory order ID",
      suggestions: orders.map((o) => o.margen_order_id),
    },
  ],
  // Matches any part of the Margen or factory order ID, ignoring case.
  records: (f, { orders }) => {
    const query = (f.order ?? "").trim().toLowerCase();
    return orders.filter(
      (o) => o.margen_order_id.toLowerCase().includes(query) || (o.factory_order_id ?? "").toLowerCase().includes(query),
    );
  },
  // One spreadsheet row per order line; an order without items still gets a row.
  rows: (orders, { orderItems, items }) =>
    orders.flatMap((order): DetailRow[] => {
      const lines = orderLinesOf(orderItems, items, order.id);
      return lines.length ? lines.map((line) => ({ order, line })) : [{ order, line: null }];
    }),
  columns: [
    ["Margen order ID", ({ order }) => order.margen_order_id, 22],
    ["Factory order ID", ({ order }) => order.factory_order_id ?? "", 18],
    ["Organization", ({ order }) => order.organization?.name ?? "", 30],
    ["Factory", ({ order }) => order.factory?.name ?? "", 24],
    ["Order status", ({ order }) => ORDER_STATUSES[order.order_status], 14],
    ["Production status", ({ order }) => productionLabel(order.production_status), 20],
    ...shippingColumns<DetailRow>(({ order }) => order),
    ["Added", ({ order }) => new Date(order.created_at), 14],
    ["Item ID", ({ line }) => line?.item.item_code ?? "", 18],
    ["Item", ({ line }) => line?.item.name ?? "", 26],
    ["Size", ({ line }) => line?.size ?? "", 8],
    ["Quantity", ({ line }) => line?.quantity ?? "", 10],
  ],
};

// Each report is typed by its own row shape; the page only passes those rows back to the same report.
const anyRows = <R>(report: Report<R>) => report as unknown as Report;

// Add a new report by adding an entry here.
export const REPORTS: Report[] = [anyRows(orderReport), anyRows(orderDetailReport)];

// The spreadsheet's rows of cell values, after the heading row.
export function reportCells(report: Report, filters: FilterValues, data: ReportData) {
  return report.rows(report.records(filters, data), data).map((row) => report.columns.map(([, value]) => value(row)));
}
