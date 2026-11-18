import type { LinkedContact, Order, OrderLine } from "../../data/queries";
import { isReady, readinessOf } from "./readiness";

const order = (changes: Partial<Order> = {}) =>
  ({
    id: "o1",
    order_status: "received",
    organization_id: "org",
    factory_id: "fac",
    estimated_ship_date: "2026-12-01",
    ...changes,
  }) as Order;
const line = (order_id: string, quantity = 2) => ({ id: `${order_id}-${quantity}`, order_id, item_id: "i", size: "M", quantity }) as OrderLine;
const contact = (email: string | null, is_default = true) => ({ id: "c", first_name: "A", last_name: "B", email, city: null, country: null, is_default }) as LinkedContact;

const missing = (checks: ReturnType<typeof readinessOf>) => checks.filter((c) => !c.ok).map((c) => c.label);

describe("readinessOf", () => {
  it("is ready when the order has an organization, a factory and items", () => {
    const checks = readinessOf(order(), { lines: [line("o1")], organizationContacts: [contact("a@b.co")], factoryContacts: [contact("f@b.co")] });
    expect(missing(checks)).toEqual([]);
    expect(isReady(checks)).toBe(true);
  });

  it("lists what's needed, counting only this order's lines", () => {
    const checks = readinessOf(order({ organization_id: null, factory_id: null }), { lines: [line("other")] });
    expect(missing(checks)).toEqual(["Organization", "Factory", "Items"]);
    // No organization or factory yet: their emails aren't checked.
    expect(checks.map((c) => c.label)).not.toContain("Organization email");
    expect(isReady(checks)).toBe(false);
  });

  it("flags missing emails and date without blocking", () => {
    const checks = readinessOf(order({ estimated_ship_date: null }), {
      lines: [line("o1")],
      organizationContacts: [contact("a@b.co", false)],
      factoryContacts: [contact(null)],
    });
    expect(missing(checks)).toEqual(["Estimated shipping date", "Organization email", "Factory email"]);
    expect(isReady(checks)).toBe(true);
  });
});
