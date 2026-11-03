import type { Order, Organization } from "../../data/queries";
import { checkImportRows, parseStatus, sheetToRows } from "./importRows";
import { ORDER_STATUSES } from "../../lib/constants";

const org = (id: string, name: string): Organization => ({ id, name, state: null, country: null, created_at: "2026-01-01", contacts: [] });
const order = (o: Partial<Order> & Pick<Order, "id" | "margen_order_id">): Order => ({
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
  created_at: "2026-01-01T00:00:00Z",
  ...o,
});

describe("sheetToRows", () => {
  it("matches headings loosely and skips empty lines", () => {
    const rows = sheetToRows(
      [
        ["Margen ID", "Factory Order-ID", "Client", "Status", "Production"],
        ["A1", "F1", "Outrigger", "on hold", "Sewing"],
        ["", "", "", "", ""],
      ],
      "orders.xlsx",
    );
    expect(rows).toEqual([
      { line: 2, margen_order_id: "A1", factory_order_id: "F1", organization: "Outrigger", order_status: "on hold", production_status: "Sewing" },
    ]);
  });

  it("refuses a sheet without a Margen order ID column", () => {
    expect(() => sheetToRows([["Factory ID"], ["F1"]], "x.csv")).toThrow('x.csv has no "Margen order ID" column');
  });

  it("refuses a sheet with no orders", () => {
    expect(() => sheetToRows([["Margen order ID"]], "x.csv")).toThrow("x.csv has no orders in it.");
  });
});

describe("parseStatus", () => {
  it("accepts keys and labels in any case or spacing", () => {
    expect(parseStatus(ORDER_STATUSES, "ON HOLD")).toBe("on_hold");
    expect(parseStatus(ORDER_STATUSES, "on_hold")).toBe("on_hold");
    expect(parseStatus(ORDER_STATUSES, "nope")).toBeUndefined();
  });
});

describe("checkImportRows", () => {
  const orgs = [org("o1", "Outrigger Canoe Club")];
  const orders = [order({ id: "1", margen_order_id: "A1", factory_order_id: "F1", order_status: "accepted" })];
  const raw = (r: Partial<Record<string, string>> & { margen_order_id: string }, line = 2) => ({
    line,
    factory_order_id: "",
    organization: "",
    order_status: "",
    production_status: "",
    ...r,
  });

  it("adds unknown orders, updates changed ones and leaves identical ones", () => {
    const rows = checkImportRows(
      [
        raw({ margen_order_id: "B2", organization: "outrigger  canoe club" }),
        raw({ margen_order_id: "A1", order_status: "Closed" }, 3),
        raw({ margen_order_id: "A1", order_status: "Accepted" }, 4),
      ],
      orders,
      orgs,
    );
    expect(rows[0]).toMatchObject({ action: "new", change: { organization_id: "o1" } });
    expect(rows[1]).toMatchObject({ action: "update", change: { order_status: "closed" } });
    // The same Margen order ID twice in one file is an error.
    expect(rows[2]).toMatchObject({ action: "error", errors: ["Margen order ID is in the file twice"] });
  });

  it("reports every problem on a row", () => {
    const [row] = checkImportRows(
      [raw({ margen_order_id: "C3", factory_order_id: "F1", organization: "Nobody", order_status: "Lost", production_status: "Dyeing" })],
      orders,
      orgs,
    );
    expect(row.action).toBe("error");
    expect(row.errors).toEqual([
      "Factory order ID is already used by A1",
      'No organization called "Nobody"',
      '"Lost" isn\'t an order status',
      '"Dyeing" isn\'t a production status',
    ]);
  });

  it('clears a production status with "Not started"', () => {
    const started = [order({ id: "1", margen_order_id: "A1", production_status: "sewing" })];
    const [row] = checkImportRows([raw({ margen_order_id: "A1", production_status: "not started" })], started, orgs);
    expect(row).toMatchObject({ action: "update", change: { production_status: null } });
  });
});
