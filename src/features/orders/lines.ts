import type { Item, OrderLine } from "../../data/queries";
import { SIZES } from "../../lib/constants";

export type LineWithItem = OrderLine & { item: Item };

const bySize = (a: { size: string }, b: { size: string }) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size);

// An order's lines with their item, sorted by item name then size.
export function orderLinesOf(lines: OrderLine[], items: Item[], orderId: string): LineWithItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return lines
    .filter((l) => l.order_id === orderId && byId.has(l.item_id))
    .map((l) => ({ ...l, item: byId.get(l.item_id)! }))
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || bySize(a, b));
}

export const piecesIn = (lines: OrderLine[], orderId: string) =>
  lines.filter((l) => l.order_id === orderId).reduce((sum, l) => sum + l.quantity, 0);

export const sortBySize = <T extends { size: string }>(lines: T[]) => [...lines].sort(bySize);

// A quantity typed into a form: a whole number of 1 or more, or null.
export function parseQuantity(text: string) {
  const quantity = Number(text);
  return Number.isInteger(quantity) && quantity >= 1 ? quantity : null;
}
