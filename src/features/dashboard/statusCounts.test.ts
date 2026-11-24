import { ORDER_STATUSES } from "../../lib/constants";
import { FLOW_STATUSES, SIDE_STATUSES } from "./statusCounts";

describe("the Dashboard's order flow", () => {
  it("shows every order status, in the flow or beside it", () => {
    expect([...FLOW_STATUSES, ...SIDE_STATUSES].sort()).toEqual(Object.keys(ORDER_STATUSES).sort());
    expect(SIDE_STATUSES).toEqual(["cancelled"]);
  });
});
