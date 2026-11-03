import type { ReactNode } from "react";
import { Count, DateTime } from "../../components/ui";
import { useOrderEvents, type OrderEvent } from "../../data/queries";
import { ORDER_STATUSES, PRODUCTION_STATUSES } from "../../lib/constants";
import { formatDay } from "../../lib/format";

// Fields the order_events trigger records, in the order they're listed.
const AUDIT_FIELDS: Record<string, string> = {
  margen_order_id: "Margen order ID",
  factory_order_id: "Factory order ID",
  organization: "Organization",
  factory: "Factory",
  order_status: "Order status",
  production_status: "Production status",
  estimated_ship_date: "Estimated shipping date",
  actual_ship_date: "Actual shipping date",
  shipping_method: "Shipping method",
  tracking_number: "Tracker",
};
const AUDIT_ACTIONS: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  deleted: "Deleted",
  item_added: "Item added",
  item_changed: "Item changed",
  item_removed: "Item removed",
};

export function auditValue(field: string, value: unknown): string {
  if (field === "order_status") return ORDER_STATUSES[value as string] ?? String(value);
  if (field === "production_status") return value ? (PRODUCTION_STATUSES[value as string] ?? String(value)) : "Not started";
  if (value == null) return "None";
  if (field.endsWith("_ship_date")) return formatDay(String(value));
  return String(value);
}

const Arrow = () => <span className="muted">→</span>;

type Diff<T = unknown> = { from?: T; to?: T };

// Change lines for an item_added / item_changed / item_removed event.
function lineChanges(e: OrderEvent): ReactNode {
  const { item, size, quantity } = e.changes as { item: Diff; size: Diff; quantity: Diff };
  if (e.action !== "item_changed") {
    const side = e.action === "item_added" ? "to" : "from";
    return (
      <li>
        {String(item[side])}, size {String(size[side])} <span className="muted">×</span> {String(quantity[side])}
      </li>
    );
  }
  const diff = (label: string, { from, to }: Diff) =>
    from === to ? null : (
      <li key={label}>
        <span className="muted">{label}:</span> {String(from)} <Arrow /> {String(to)}
      </li>
    );
  return (
    <>
      <li>
        {String(item.from)}, size {String(size.from)}
      </li>
      {diff("Item", item)}
      {diff("Size", size)}
      {diff("Quantity", quantity)}
    </>
  );
}

function fieldChanges(e: OrderEvent): ReactNode[] {
  return Object.keys(AUDIT_FIELDS)
    .filter((field) => field in e.changes)
    .map((field) => {
      const { from, to } = e.changes[field];
      return (
        <li key={field}>
          <span className="muted">{AUDIT_FIELDS[field]}:</span>{" "}
          {e.action === "created" ? (
            auditValue(field, to)
          ) : (
            <>
              {auditValue(field, from)} <Arrow /> {auditValue(field, to)}
            </>
          )}
        </li>
      );
    });
}

// Every change to the order, newest first, with who made it. Written by database triggers.
export function OrderHistory({ orderId }: { orderId: string }) {
  const events = useOrderEvents();
  const own = (events.data ?? []).filter((e) => e.order_id === orderId);
  return (
    <>
      <h2>
        Order history <Count n={own.length} />
      </h2>
      {own.length ? (
        <ol className="notes-list">
          {own.map((e) => {
            const changes = e.action.startsWith("item_") ? lineChanges(e) : fieldChanges(e);
            const hasChanges = Array.isArray(changes) ? changes.length > 0 : true;
            return (
              <li key={e.id} className="note audit-event">
                <div className="note-meta">
                  <DateTime value={e.changed_at} />
                  <span className="note-author">{e.author?.email ?? "System"}</span>
                </div>
                <p className="note-body strong">{AUDIT_ACTIONS[e.action]}</p>
                {hasChanges && <ul className="audit-changes">{changes}</ul>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">{events.isPending ? "Loading…" : "No changes recorded yet."}</p>
      )}
    </>
  );
}
