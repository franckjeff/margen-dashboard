import { ORDER_STATUSES, PRODUCTION_STATUSES } from "./constants";

// The status flow, as the database enforces it (supabase/migrations/20261124170000_order_status_flow.sql),
// so menus offer only the changes it will accept. Nobody jumps a step, admins included.

type FlowOrder = { order_status: string; production_status: string | null; factory_id: string | null; archived_at?: string | null };

// Production steps in order; null is Not started.
export const PRODUCTION_STEPS: (string | null)[] = [null, ...Object.keys(PRODUCTION_STATUSES)];

const OPEN = ["received", "accepted", "in_production"];

// The order statuses an order can be given by hand, its current one first.
// In production and Shipped otherwise come from the flow: assigning a factory, and production Shipped.
export function orderStatusChoices(order: FlowOrder): string[] {
  const now = order.order_status;
  if (order.archived_at) return [now];
  const next: string[] = [];
  if (now === "received") next.push("accepted");
  if (now === "accepted") next.push("received");
  if (now === "accepted" && order.factory_id) next.push("in_production");
  if (OPEN.includes(now)) next.push("cancelled");
  return [now, ...next];
}

// The production statuses an order can be given: one step either way while it's In production, and
// one step back from Shipped once it has shipped. Its current one comes first.
export function productionChoices(order: FlowOrder): (string | null)[] {
  const now = order.production_status;
  if (order.archived_at) return [now];
  const at = PRODUCTION_STEPS.indexOf(now);
  const back = at > 0 ? [PRODUCTION_STEPS[at - 1]] : [];
  const on = at >= 0 && at < PRODUCTION_STEPS.length - 1 ? [PRODUCTION_STEPS[at + 1]] : [];
  if (order.order_status === "in_production") return [now, ...back, ...on];
  if (order.order_status === "shipped") return [now, ...back];
  return [now];
}

// Whether the order can be assigned to a factory, moved or taken off one now.
export const canChangeFactory = (order: FlowOrder) => !order.archived_at && (order.order_status === "accepted" || order.order_status === "in_production");

// Only Shipped orders can be archived; an archived order's statuses and factory don't change until it is unarchived.
export const canArchive = (order: FlowOrder) => order.order_status === "shipped";

// Whether the factory can be taken off: not once production has gone past Accepted.
export const canRemoveFactory = (order: FlowOrder) => PRODUCTION_STEPS.indexOf(order.production_status) <= PRODUCTION_STEPS.indexOf("accepted");

// Menu labels for the choices, in flow order.
export const orderStatusLabels = (order: FlowOrder) => {
  const allowed = orderStatusChoices(order);
  return Object.fromEntries(Object.entries(ORDER_STATUSES).filter(([key]) => allowed.includes(key)));
};
export const productionLabels = (order: FlowOrder) => {
  const allowed = productionChoices(order);
  return Object.fromEntries(Object.entries(PRODUCTION_STATUSES).filter(([key]) => allowed.includes(key)));
};
// Whether Not started is one of the production choices.
export const notStartedAllowed = (order: FlowOrder) => productionChoices(order).includes(null);

// Why a change the flow doesn't allow is refused, or null when it's allowed. Used to check an import.
export function orderStatusProblem(order: FlowOrder, to: string): string | null {
  if (orderStatusChoices(order).includes(to)) return null;
  if (order.archived_at) return "the order is archived: unarchive it first";
  if (order.order_status === "shipped" || order.order_status === "cancelled") return `the order is ${ORDER_STATUSES[order.order_status]}, so its status can't change`;
  if (to === "in_production") return "an order goes In production when it is assigned to a factory";
  if (to === "shipped") return "an order is marked Shipped when its production is set to Shipped";
  return `an order can't go from ${ORDER_STATUSES[order.order_status]} to ${ORDER_STATUSES[to]}`;
}
export function productionProblem(order: FlowOrder, to: string | null): string | null {
  if (productionChoices(order).includes(to)) return null;
  const label = (s: string | null) => (s ? PRODUCTION_STATUSES[s] : "Not started");
  if (order.archived_at) return "the order is archived: unarchive it first";
  if (order.order_status !== "in_production" && order.order_status !== "shipped") return "production can only change while the order is In production";
  return `production can't go from ${label(order.production_status)} to ${label(to)}: one step at a time`;
}
