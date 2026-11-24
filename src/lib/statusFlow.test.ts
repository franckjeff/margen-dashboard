import { canArchive, canChangeFactory, canRemoveFactory, orderStatusChoices, productionChoices } from "./statusFlow";

const order = (order_status: string, production_status: string | null = null, factory_id: string | null = null) => ({
  order_status,
  production_status,
  factory_id,
});

describe("orderStatusChoices", () => {
  it("offers only the next steps by hand, the current status first", () => {
    expect(orderStatusChoices(order("received"))).toEqual(["received", "accepted", "cancelled"]);
    expect(orderStatusChoices(order("accepted"))).toEqual(["accepted", "received", "cancelled"]);
    expect(orderStatusChoices(order("accepted", null, "f"))).toEqual(["accepted", "received", "in_production", "cancelled"]);
    expect(orderStatusChoices(order("in_production", "sewing", "f"))).toEqual(["in_production", "cancelled"]);
  });

  it("leaves Shipped and Cancelled orders as they are", () => {
    expect(orderStatusChoices(order("shipped", "shipped", "f"))).toEqual(["shipped"]);
    expect(orderStatusChoices(order("cancelled"))).toEqual(["cancelled"]);
  });
});

describe("productionChoices", () => {
  it("moves one step either way while the order is In production", () => {
    expect(productionChoices(order("in_production", null, "f"))).toEqual([null, "received"]);
    expect(productionChoices(order("in_production", "sewing", "f"))).toEqual(["sewing", "in_printing_queue", "trimming"]);
  });

  it("only steps back from Shipped once the order has shipped", () => {
    expect(productionChoices(order("shipped", "shipped", "f"))).toEqual(["shipped", "trimming"]);
  });

  it("doesn't change before the order is In production, or once it's cancelled", () => {
    expect(productionChoices(order("accepted"))).toEqual([null]);
    expect(productionChoices(order("cancelled", "sewing", "f"))).toEqual(["sewing"]);
  });
});

describe("factory changes", () => {
  it("are allowed once the order is Accepted, and until it ships", () => {
    expect(canChangeFactory(order("received"))).toBe(false);
    expect(canChangeFactory(order("accepted"))).toBe(true);
    expect(canChangeFactory(order("in_production", "sewing", "f"))).toBe(true);
    expect(canChangeFactory(order("shipped", "shipped", "f"))).toBe(false);
  });

  it("can't take the factory off once production has gone past Accepted", () => {
    expect(canRemoveFactory(order("in_production", "accepted", "f"))).toBe(true);
    expect(canRemoveFactory(order("in_production", "artwork_in_progress", "f"))).toBe(false);
  });
});

describe("archived orders", () => {
  it("can only be archived once shipped", () => {
    expect(canArchive(order("shipped", "shipped", "f"))).toBe(true);
    expect(canArchive(order("in_production", "sewing", "f"))).toBe(false);
    expect(canArchive(order("cancelled"))).toBe(false);
  });

  it("keep their statuses and factory until unarchived", () => {
    const archived = { ...order("shipped", "shipped", "f"), archived_at: "2026-11-24T00:00:00Z" };
    expect(orderStatusChoices(archived)).toEqual(["shipped"]);
    expect(productionChoices(archived)).toEqual(["shipped"]);
    expect(canChangeFactory(archived)).toBe(false);
  });
});
