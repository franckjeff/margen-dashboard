import type { Item, Order, OrderLine } from "../../data/queries";
import { orderLinesOf, parseQuantity, piecesIn } from "../orders/lines";
import { REPORTS, reportCells, withinDates, type ReportData } from "./reports";

const order = (id: string, margen: string, extra: Partial<Order> = {}): Order => ({
  id,
  margen_order_id: margen,
  factory_order_id: null,
  order_status: "received",
  production_status: null,
  organization_id: null,
  organization: null,
  factory_id: null,
  factory: null,
  estimated_ship_date: null,
  actual_ship_date: null,
  shipping_method: null,
  tracking_number: null,
  created_at: "2026-11-02T10:00:00",
  ...extra,
});
const items: Item[] = [
  { id: "i1", item_code: "WMN-RACERBACK", name: "Women's Racerback", created_at: "" },
  { id: "i2", item_code: "MEN-TANK", name: "Men's Tank", created_at: "" },
];
const lines: OrderLine[] = [
  { id: "l1", order_id: "1", item_id: "i1", size: "XL", quantity: 3 },
  { id: "l2", order_id: "1", item_id: "i1", size: "S", quantity: 2 },
  { id: "l3", order_id: "1", item_id: "i2", size: "M", quantity: 5 },
];
const data: ReportData = {
  orders: [
    order("1", "2026_1_OUTRIGGER", {
      factory_order_id: "RKU1",
      production_status: "sewing",
      factory_id: "f1",
      factory: { id: "f1", name: "Rokau" },
      estimated_ship_date: "2026-12-01",
      tracking_number: "1Z999",
    }),
    order("2", "2026_2_PUFF"),
  ],
  organizations: [],
  factories: [{ id: "f1", name: "Rokau", country: "China", contact_name: "Mr Lin", description: null, created_at: "" }],
  orderItems: lines,
  items,
};

describe("order lines", () => {
  it("sorts by item name, then size in size order", () => {
    expect(orderLinesOf(lines, items, "1").map((l) => `${l.item.name} ${l.size}`)).toEqual([
      "Men's Tank M",
      "Women's Racerback S",
      "Women's Racerback XL",
    ]);
  });

  it("totals the pieces on an order", () => {
    expect(piecesIn(lines, "1")).toBe(10);
    expect(piecesIn(lines, "2")).toBe(0);
  });

  it("accepts only whole quantities of 1 or more", () => {
    expect(parseQuantity("4")).toBe(4);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("2.5")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });
});

describe("withinDates", () => {
  it("includes both ends of the range, on the local calendar", () => {
    expect(withinDates("2026-11-02T23:59:00", "2026-11-02", "2026-11-02")).toBe(true);
    expect(withinDates("2026-11-03T00:00:00", "", "2026-11-02")).toBe(false);
    expect(withinDates("2026-11-01T23:59:00", "2026-11-02", "")).toBe(false);
  });
});

describe("reports", () => {
  const [orderReport, detailReport] = REPORTS;

  it("filters the order report by production status, with not started", () => {
    expect(orderReport.records({ production_status: "not_started" }, data).map((o) => o.id)).toEqual(["2"]);
    expect(orderReport.records({ production_status: "sewing" }, data).map((o) => o.id)).toEqual(["1"]);
  });

  it("filters the order report by factory, with not assigned", () => {
    expect(orderReport.records({ factory_id: "f1" }, data).map((o) => o.id)).toEqual(["1"]);
    expect(orderReport.records({ factory_id: "none" }, data).map((o) => o.id)).toEqual(["2"]);
  });

  it("puts the factory and pieces in the order report", () => {
    const [first, second] = reportCells(orderReport, {}, data);
    expect(first.slice(0, 2)).toEqual(["2026_1_OUTRIGGER", "RKU1"]);
    expect(first[3]).toBe("Rokau");
    expect(second[3]).toBe("");
    expect(first.slice(6, 10)).toEqual([new Date("2026-12-01T00:00:00"), "", "", "1Z999"]);
    expect(first[10]).toBe(10);
  });

  it("finds orders by part of either ID, ignoring case", () => {
    expect(detailReport.records({ order: "rku" }, data).map((o) => o.id)).toEqual(["1"]);
    expect(detailReport.records({ order: "puff" }, data).map((o) => o.id)).toEqual(["2"]);
  });

  it("gives one detail row per line, and one for an order without items", () => {
    const rows = reportCells(detailReport, {}, data);
    expect(rows.map((r) => [r[0], r[12], r[13], r[14]])).toEqual([
      ["2026_1_OUTRIGGER", "Men's Tank", "M", 5],
      ["2026_1_OUTRIGGER", "Women's Racerback", "S", 2],
      ["2026_1_OUTRIGGER", "Women's Racerback", "XL", 3],
      ["2026_2_PUFF", "", "", ""],
    ]);
  });
});
