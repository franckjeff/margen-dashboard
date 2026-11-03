import { auditValue } from "./OrderHistory";

describe("auditValue", () => {
  it("shows status labels, Not started and None", () => {
    expect(auditValue("order_status", "on_hold")).toBe("On hold");
    expect(auditValue("production_status", null)).toBe("Not started");
    expect(auditValue("production_status", "in_printing_queue")).toBe("In printing queue");
    expect(auditValue("factory_order_id", null)).toBe("None");
    expect(auditValue("margen_order_id", "2026_1_X")).toBe("2026_1_X");
  });

  it("shows shipping dates as the same calendar day", () => {
    expect(auditValue("estimated_ship_date", "2026-12-01")).toBe(new Date(2026, 11, 1).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
    expect(auditValue("actual_ship_date", null)).toBe("None");
  });
});
