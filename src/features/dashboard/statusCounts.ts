import { ORDER_STATUSES } from "../../lib/constants";

// The order statuses on the Dashboard's flow, in the order an order moves through them,
// and the ones that sit beside the flow.
export const FLOW_STATUSES = ["received", "accepted", "in_production", "done"];
export const SIDE_STATUSES = Object.keys(ORDER_STATUSES).filter((s) => !FLOW_STATUSES.includes(s));

