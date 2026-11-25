import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import {
  BackLink,
  Dash,
  FormButtons,
  Missing,
  OrDash,
  OrderBadge,
  Optional,
  Options,
  PanelHead,
  ProductionBadge,
  QueryGate,
  loadingState,
} from "../../components/ui";
import { expectRows, useDbAction, useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useFactories, useOrderItems, useOrders, useOrganizations, type Order } from "../../data/queries";
import { ORDER_STATUSES, PAGES, orderListOf, productionLabel, type OrderList } from "../../lib/constants";
import type { TablesUpdate } from "../../lib/database.types";
import { formatDate, formatDay, orderOrganizationName, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { canArchive, canChangeFactory, canRemoveFactory, notStartedAllowed, orderStatusLabels, productionLabels } from "../../lib/statusFlow";
import { supabase, unwrap } from "../../lib/supabase";
import { ImportPage } from "./ImportPage";
import { piecesIn } from "./lines";
import { NotesSection } from "../notes/NotesSection";
import { OrderHistory } from "./OrderHistory";
import { OrderLines } from "./OrderLines";
import { isReady, readinessOf } from "./readiness";

// An order whose organization was deleted shows the name it kept, without a link.
const OrderOrganization = ({ order }: { order: Order }) =>
  order.organization ? (
    <Link to={`/organizations/${order.organization.id}`}>{order.organization.name}</Link>
  ) : order.organization_name ? (
    <span title="This organization was deleted; the order keeps its name.">
      {order.organization_name} <span className="muted small">(deleted)</span>
    </span>
  ) : (
    <Dash />
  );

const OrderFactory = ({ order }: { order: Order }) =>
  order.factory ? <Link to={`/factories/${order.factory.id}`}>{order.factory.name}</Link> : <Dash />;

const ShipDay = ({ day }: { day: string | null }) => (day ? <>{formatDay(day)}</> : <Dash />);

// A tracking link opens in a new tab; a tracking number is shown as it is.
const Tracker = ({ value }: { value: string | null }) =>
  !value ? (
    <Dash />
  ) : /^https?:\/\//i.test(value) ? (
    <a href={value} target="_blank" rel="noreferrer">
      {value}
    </a>
  ) : (
    <>{value}</>
  );

// The shipping inputs, shared by the admin's order form and the factory's shipping form.
function ShippingFields({ order }: { order?: Order }) {
  return (
    <div className="shipping-fields">
      <label>
        <Optional>Estimated shipping date</Optional>
        <input type="date" name="estimated_ship_date" defaultValue={order?.estimated_ship_date ?? ""} />
      </label>
      <label>
        <Optional>Actual shipping date</Optional>
        <input type="date" name="actual_ship_date" defaultValue={order?.actual_ship_date ?? ""} />
      </label>
      <label>
        <Optional>Shipping method</Optional>
        <input name="shipping_method" autoComplete="off" defaultValue={order?.shipping_method ?? ""} placeholder="e.g. DHL Express, sea freight" />
      </label>
      <label>
        <Optional>Tracker</Optional>
        <input name="tracking_number" autoComplete="off" defaultValue={order?.tracking_number ?? ""} placeholder="Tracking number or link" />
      </label>
    </div>
  );
}

const shippingRow = (v: Record<string, string>) => ({
  estimated_ship_date: orNull(v.estimated_ship_date),
  actual_ship_date: orNull(v.actual_ship_date),
  shipping_method: orNull(v.shipping_method),
  tracking_number: orNull(v.tracking_number),
});
const shippingKey = (o: Order) => [o.estimated_ship_date, o.actual_ship_date, o.shipping_method, o.tracking_number].join("|");

// The factory choices. "Not assigned" is left out once the factory can no longer be taken off the order.
function FactoryOptions({ allowNone = true }: { allowNone?: boolean }) {
  const factories = useFactories();
  return (
    <>
      {allowNone && <option value="">Not assigned</option>}
      {factories.data?.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </>
  );
}

function OrderForm({ order }: { order?: Order }) {
  const save = useSaveRecord("orders");
  const organizations = useOrganizations();
  const factories = useFactories();
  const { notify } = useNotice();
  const back = order ? `/customs/${order.id}` : "/customs";
  return (
    <>
      <PanelHead title={order ? "Edit order" : "New order"} close={back} />
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = {
            margen_order_id: v.margen_order_id,
            factory_order_id: orNull(v.factory_order_id),
            organization_id: orNull(v.organization_id),
            ...shippingRow(v),
            // A new order starts Received, with production Not started and no factory: the database sets them.
            ...(order && {
              factory_id: canChangeFactory(order) ? orNull(v.factory_id) : order.factory_id,
              order_status: v.order_status,
              production_status: orNull(v.production_status),
            }),
          };
          if (!row.margen_order_id) return notify("error", "The order needs a Margen order ID.");
          save.mutate({ row, id: order?.id, label: `order ${row.margen_order_id}` });
        }}
      >
        <label>
          Margen order ID
          <input name="margen_order_id" required autoFocus autoComplete="off" defaultValue={order?.margen_order_id} placeholder="e.g. 2026_1_OUTRIGGER" />
        </label>
        <label>
          <Optional>Factory order ID</Optional>
          <input name="factory_order_id" autoComplete="off" defaultValue={order?.factory_order_id ?? ""} placeholder="e.g. RKU12060-M" />
        </label>
        <label>
          <Optional>Organization</Optional>
          {/* Keyed so the saved choice shows once the organizations have loaded. */}
          <select name="organization_id" key={organizations.data ? "ready" : "loading"} defaultValue={order?.organization_id ?? ""}>
            <option value="">No organization</option>
            {organizations.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {order ? (
          <>
            <label>
              <Optional>Factory</Optional>
              <select
                name="factory_id"
                key={factories.data ? "ready" : "loading"}
                defaultValue={order.factory_id ?? ""}
                disabled={!canChangeFactory(order)}
                title={canChangeFactory(order) ? undefined : "A factory is assigned once the order is Accepted."}
              >
                <FactoryOptions allowNone={!order.factory_id || canRemoveFactory(order)} />
              </select>
            </label>
            <div className="field-row">
              <label>
                Order status
                <select name="order_status" defaultValue={order.order_status}>
                  <Options labels={orderStatusLabels(order)} />
                </select>
              </label>
              <label>
                Production status
                <select name="production_status" defaultValue={order.production_status ?? ""}>
                  <Options labels={productionLabels(order)} emptyLabel={notStartedAllowed(order) ? "Not started" : undefined} />
                </select>
              </label>
            </div>
          </>
        ) : (
          <p className="muted small">
            The order starts as Received, with production Not started. Accept it, then assign a factory to start production.
          </p>
        )}
        <ShippingFields order={order} />
        <FormButtons label={order ? "Save changes" : "Create order"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// The order pages, under the Custom Orders menu, and each order's own page (#/customs/<id>); the data is the
// "orders" table. `list` picks which orders are listed: New (#/customs, the default), In Production,
// Shipped, or Cancelled & Archived: cancelled orders, and the shipped ones an admin has archived (older
// orders may have been archived at another status).
// Factory users see the same pages without client details, and change only production and shipping;
// client users see them read only, without factory details. The database only returns each one's own orders.
export function OrdersPage({ id, editing = false, list = "customs" }: { id?: string; editing?: boolean; list?: OrderList | "archived-orders" }) {
  const archived = list === "archived-orders";
  const orders = useOrders();
  const orderItems = useOrderItems();
  const { role } = useSignedIn();
  const adminView = role === "admin";
  const factoryView = role === "factory";

  if (!adminView && (id === "import" || id === "new" || editing)) return <Navigate to={id === "import" || id === "new" ? "/customs" : `/customs/${id}`} replace />;
  if (id === "import") return <ImportPage />;
  if (id && id !== "new") {
    return (
      <QueryGate queries={[orders]}>
        {() => {
          const order = orders.data!.find((o) => o.id === id);
          if (!order) return <Missing back="/customs" backLabel="New" what="order" />;
          if (adminView) return <OrderPage order={order} editing={editing} />;
          return factoryView ? <FactoryOrderPage order={order} /> : <ClientOrderPage order={order} />;
        }}
      </QueryGate>
    );
  }

  const all = (orders.data ?? []).filter((o) => orderListOf(o) === list);
  const title = PAGES.find((p) => p.name === list)!.label;
  const lines = orderItems.data ?? [];
  const isNew = list === "customs";
  return (
    <ListPage
      title={title}
      count={all.length}
      newTo={adminView && isNew ? "/customs/new" : undefined}
      newLabel="New order"
      placeholder="Search orders"
      loading={loadingState([orders, orderItems])}
      empty="No orders here."
      selection={{
        noun: "order",
        summary: (ids) => plural(ids.reduce((sum, id) => sum + piecesIn(lines, id), 0), "piece"),
      }}
      actions={
        adminView &&
        isNew && (
          <Link to="/customs/import" className="button">
            Import from Excel
          </Link>
        )
      }
      head={
        <>
          <th>Margen order ID</th>
          {role !== "client" && <th className="hide-sm">Factory order ID</th>}
          {adminView && <th className="hide-sm">Organization</th>}
          {adminView && <th className="hide-sm">Factory</th>}
          <th>Order status</th>
          <th>Production</th>
          <th className={adminView ? "hide-sm" : undefined}>Est. shipping</th>
          <th className="num hide-sm">Pieces</th>
          {archived && <th className="hide-sm">Archived</th>}
        </>
      }
      rows={all.map((o) => ({
        key: o.id,
        to: `/customs/${o.id}`,
        search: `${o.margen_order_id} ${o.factory_order_id ?? ""} ${orderOrganizationName(o) ?? ""} ${o.factory?.name ?? ""} ${ORDER_STATUSES[o.order_status]} ${productionLabel(
          o.production_status,
        )}`.toLowerCase(),
        cells: (
          <>
            <td>
              <Link to={`/customs/${o.id}`} className="strong mono">
                {o.margen_order_id}
              </Link>
            </td>
            {role !== "client" && (
              <td className="mono hide-sm">
                <OrDash>{o.factory_order_id}</OrDash>
              </td>
            )}
            {adminView && (
              <td className="hide-sm">
                <OrderOrganization order={o} />
              </td>
            )}
            {adminView && (
              <td className="hide-sm">
                <OrderFactory order={o} />
              </td>
            )}
            <td>
              <OrderBadge status={o.order_status} />
            </td>
            {/* Factory users change these two right in the list. */}
            {factoryView ? (
              <FactoryRowCells order={o} />
            ) : (
              <>
                <td>
                  <ProductionBadge status={o.production_status} />
                </td>
                <td className={adminView ? "hide-sm" : undefined}>
                  <ShipDay day={o.estimated_ship_date} />
                </td>
              </>
            )}
            <td className="num hide-sm">{piecesIn(lines, o.id) || <Dash />}</td>
            {archived && <td className="hide-sm">{o.archived_at ? formatDate(o.archived_at) : <Dash />}</td>}
          </>
        ),
      }))}
      panel={id === "new" ? <OrderForm /> : undefined}
    />
  );
}

// Fields changed in place: from an order page's header, or in the factory's Orders list.
// "archived" takes any value to archive the order now, or "" to bring it back.
type QuickField = "order_status" | "production_status" | "factory_id" | "estimated_ship_date" | "archived";
const QUICK_CHANGES: Record<QuickField, (value: string) => TablesUpdate<"orders">> = {
  order_status: (value) => ({ order_status: value }),
  production_status: (value) => ({ production_status: value || null }),
  factory_id: (value) => ({ factory_id: value || null }),
  estimated_ship_date: (value) => ({ estimated_ship_date: value || null }),
  archived: (value) => ({ archived_at: value ? new Date().toISOString() : null }),
};

// Back to the list the order is on.
function OrdersBackLink({ order }: { order: Order }) {
  const list = orderListOf(order);
  return <BackLink to={`/${list}`}>{PAGES.find((p) => p.name === list)?.label}</BackLink>;
}

const archivedNote = (order: Order) => (order.archived_at ? ` · Archived ${formatDate(order.archived_at)}` : "");

function useSetOrderField(order: Order) {
  const factories = useFactories();
  const label = `order ${order.margen_order_id}`;
  const factoryName = (id: string) => factories.data?.find((f) => f.id === id)?.name ?? "the factory";
  return useDbAction({
    tables: ["orders"],
    run: async ({ field, value }: { field: QuickField; value: string }) =>
      expectRows(
        unwrap(await supabase.from("orders").update(QUICK_CHANGES[field](value)).eq("id", order.id).select("id")),
        `${label} wasn't changed. You may not have permission.`,
      ),
    success: ({ field, value }) => {
      const id = order.margen_order_id;
      if (field === "order_status") return `Order ${id} is now ${ORDER_STATUSES[value]}.`;
      if (field === "production_status") return `Order ${id} production: ${productionLabel(value || null)}.`;
      if (field === "archived") return value ? `Archived order ${id}.` : `Order ${id} is no longer archived.`;
      if (field === "estimated_ship_date")
        return value ? `Order ${id} is estimated to ship on ${formatDay(value)}.` : `Removed the estimated shipping date of order ${id}.`;
      return value ? `Order ${id} is assigned to ${factoryName(value)}.` : `Order ${id} is no longer assigned to a factory.`;
    },
    failure: () => `Couldn't change ${label}`,
  });
}

function ProductionSelect({ order, setField }: { order: Order; setField: ReturnType<typeof useSetOrderField> }) {
  return (
    <label className="inline-select">
      Production
      <select
        aria-label="Production status"
        value={order.production_status ?? ""}
        disabled={setField.isPending}
        onChange={(e) => setField.mutate({ field: "production_status", value: e.target.value })}
      >
        <Options labels={productionLabels(order)} emptyLabel={notStartedAllowed(order) ? "Not started" : undefined} />
      </select>
    </label>
  );
}

// The factory's Production and Est. shipping cells in the Orders list, each saved as soon as it changes.
function FactoryRowCells({ order }: { order: Order }) {
  const setField = useSetOrderField(order);
  const id = order.margen_order_id;
  return (
    <>
      <td>
        <select
          className="cell-input"
          aria-label={`Production status of ${id}`}
          value={order.production_status ?? ""}
          disabled={setField.isPending}
          onChange={(e) => setField.mutate({ field: "production_status", value: e.target.value })}
        >
          <Options labels={productionLabels(order)} emptyLabel={notStartedAllowed(order) ? "Not started" : undefined} />
        </select>
      </td>
      <td>
        <input
          type="date"
          className="cell-input"
          aria-label={`Estimated shipping date of ${id}`}
          // Remounts with the saved date after each change, or when a change fails.
          key={`${order.estimated_ship_date}-${setField.failureCount}`}
          defaultValue={order.estimated_ship_date ?? ""}
          disabled={setField.isPending}
          onChange={(e) => {
            const value = e.target.value;
            // While a year is being typed the box briefly holds dates like 0202-12-01; wait for a real one.
            if (value && Number(value.slice(0, 4)) < 2000) return;
            if (value !== (order.estimated_ship_date ?? "")) setField.mutate({ field: "estimated_ship_date", value });
          }}
        />
      </td>
    </>
  );
}

const detail = (term: string, value: ReactNode, className?: string) => (
  <div>
    <dt>{term}</dt>
    <dd className={className}>{value}</dd>
  </div>
);

const shippingDetails = (order: Order) => (
  <>
    {detail("Estimated shipping date", <ShipDay day={order.estimated_ship_date} />)}
    {detail("Actual shipping date", <ShipDay day={order.actual_ship_date} />)}
    {detail("Shipping method", <OrDash>{order.shipping_method}</OrDash>)}
    {detail("Tracker", <Tracker value={order.tracking_number} />, "mono")}
  </>
);

// For a Received order: whether it seems to have everything it needs to be Accepted, and what's missing.
export function ReadinessBar({ order }: { order: Order }) {
  const setField = useSetOrderField(order);
  const orderItems = useOrderItems();
  const organizations = useOrganizations();
  if (!orderItems.data || !organizations.data) return null;
  const checks = readinessOf(order, {
    lines: orderItems.data,
    organizationContacts: organizations.data.find((o) => o.id === order.organization_id)?.contacts,
  });
  const ready = isReady(checks);
  const needed = checks.filter((c) => !c.ok && c.needed);
  const worth = checks.filter((c) => !c.ok && !c.needed);
  return (
    <section className={`card readiness ${ready ? "ready" : "not-ready"}`} aria-label="Ready to accept?">
      <div className="readiness-head">
        <span className="readiness-icon" aria-hidden="true">
          {ready ? "✓" : "!"}
        </span>
        <div className="readiness-title">
          <strong>{ready ? "Ready to be accepted" : "Not ready to be accepted"}</strong>
          <span className="muted small">
            {ready
              ? worth.length
                ? "Everything needed is there; a few details are still worth adding."
                : "The order has everything it needs."
              : `Missing ${plural(needed.length, "thing")} before it can be accepted.`}
          </span>
        </div>
        {ready && (
          <button
            type="button"
            className="primary"
            disabled={setField.isPending}
            onClick={() => setField.mutate({ field: "order_status", value: "accepted" })}
          >
            Accept order
          </button>
        )}
      </div>
      <ul className="readiness-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : c.needed ? "needed" : "worth"}>
            <span aria-hidden="true">{c.ok ? "✓" : c.needed ? "✕" : "!"}</span>
            <span>
              <span className="strong">{c.label}</span>
              {!c.ok && <span className="readiness-missing"> · {c.missing}</span>}
              {!c.ok && <span className="sr-only">{c.needed ? " (needed)" : " (worth adding)"}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrderPage({ order, editing }: { order: Order; editing: boolean }) {
  const remove = useDeleteRecord("orders");
  const orderItems = useOrderItems();
  const factories = useFactories();
  const setField = useSetOrderField(order);
  const label = `order ${order.margen_order_id}`;

  const confirmDelete = () => {
    const lineCount = (orderItems.data ?? []).filter((l) => l.order_id === order.id).length;
    const message = deleteMessage(label, [lineCount > 0 && `Its ${plural(lineCount, "item line")} will be deleted too.`]);
    if (confirm(message)) remove.mutate({ id: order.id, label });
  };

  return (
    <>
      <OrdersBackLink order={order} />
      <div className="page-head">
        <div className="title-block">
          <h1 className="mono">{order.margen_order_id}</h1>
          <p className="muted">
            {order.factory_order_id ? `Factory order ${order.factory_order_id}` : "No factory order ID yet"}
            {archivedNote(order)}
          </p>
        </div>
        {!editing && (
          <>
            <label className="inline-select">
              Order
              <select
                aria-label="Order status"
                value={order.order_status}
                disabled={setField.isPending}
                onChange={(e) => setField.mutate({ field: "order_status", value: e.target.value })}
              >
                <Options labels={orderStatusLabels(order)} />
              </select>
            </label>
            <label className="inline-select">
              Factory
              <select
                aria-label="Factory"
                value={order.factory_id ?? ""}
                disabled={setField.isPending || factories.isPending || !canChangeFactory(order)}
                title={canChangeFactory(order) ? undefined : "A factory is assigned once the order is Accepted."}
                onChange={(e) => setField.mutate({ field: "factory_id", value: e.target.value })}
              >
                <FactoryOptions allowNone={!order.factory_id || canRemoveFactory(order)} />
              </select>
            </label>
            <ProductionSelect order={order} setField={setField} />
            <Link to={`/customs/${order.id}/edit`} className="button">
              Edit
            </Link>
            {/* Archiving keeps the order's status; it only moves the order to Cancelled & Archived. Only Shipped orders. */}
            {(order.archived_at || canArchive(order)) && (
              <button
                type="button"
                disabled={setField.isPending}
                onClick={() => setField.mutate({ field: "archived", value: order.archived_at ? "" : "yes" })}
              >
                {order.archived_at ? "Unarchive" : "Archive"}
              </button>
            )}
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
      {order.order_status === "received" && !order.archived_at && !editing && <ReadinessBar order={order} />}
      {/* One full-width card per row: the details read across, the items and history below. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <OrderForm order={order} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details across">
                {detail("Margen order ID", order.margen_order_id, "mono")}
                {detail("Factory order ID", <OrDash>{order.factory_order_id}</OrDash>, "mono")}
                {detail("Organization", <OrderOrganization order={order} />)}
                {detail("Factory", <OrderFactory order={order} />)}
                {detail("Order status", <OrderBadge status={order.order_status} />)}
                {detail("Production status", <ProductionBadge status={order.production_status} />)}
                {shippingDetails(order)}
                {detail("Added", formatDate(order.created_at))}
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <OrderLines order={order} editing={editing} />
        </section>
        <section className="card section">
          <OrderNotes order={order} />
        </section>
        <section className="card section">
          <OrderHistory orderId={order.id} />
        </section>
      </div>
    </>
  );
}

// Internal notes on an order, shared between the admins and the order's factory. Clients never see them.
function OrderNotes({ order }: { order: Order }) {
  return (
    <NotesSection
      subject={{ order_id: order.id }}
      placeholder="Add a note about this order…"
      hint="Shared between MARGEN and the factory, never the client. A note emails the other side."
    />
  );
}

// The factory's shipping form: both dates, the method and the tracker, saved together.
function ShippingForm({ order }: { order: Order }) {
  const id = order.margen_order_id;
  const save = useDbAction({
    tables: ["orders"],
    run: async (changes: TablesUpdate<"orders">) =>
      expectRows(
        unwrap(await supabase.from("orders").update(changes).eq("id", order.id).select("id")),
        `Order ${id} wasn't changed. You may not have permission.`,
      ),
    success: () => `Saved the shipping details of order ${id}.`,
    failure: () => `Couldn't save the shipping details of order ${id}`,
  });
  return (
    <>
      <h2>Shipping</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          save.mutate(shippingRow(v));
        }}
      >
        <ShippingFields order={order} />
        <div className="form-actions">
          <button type="submit" className="primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save shipping"}
          </button>
        </div>
      </form>
    </>
  );
}

// What a factory user sees: the order's details and items, with no client details. They can change
// the production status and the shipping details, and nothing else; the database enforces that too.
function FactoryOrderPage({ order }: { order: Order }) {
  const setField = useSetOrderField(order);
  return (
    <>
      <OrdersBackLink order={order} />
      <div className="page-head">
        <div className="title-block">
          <h1 className="mono">{order.margen_order_id}</h1>
          <p className="muted">
            {order.factory_order_id ? `Factory order ${order.factory_order_id}` : "No factory order ID yet"}
            {archivedNote(order)}
          </p>
        </div>
        <ProductionSelect order={order} setField={setField} />
      </div>
      {/* One full-width card per row: the details read across, the items and history below. */}
      <div className="detail-grid stacked">
        <section className="card section">
          <h2>Details</h2>
          <dl className="details across">
            {detail("Margen order ID", order.margen_order_id, "mono")}
            {detail("Factory order ID", <OrDash>{order.factory_order_id}</OrDash>, "mono")}
            {detail("Order status", <OrderBadge status={order.order_status} />)}
            {detail("Production status", <ProductionBadge status={order.production_status} />)}
            {detail("Added", formatDate(order.created_at))}
          </dl>
        </section>
        <section className="card section">
          {/* Keyed so the form shows the saved values after each save. */}
          <ShippingForm key={shippingKey(order)} order={order} />
        </section>
        <section className="card section">
          <OrderLines order={order} editing={false} canEdit={false} />
        </section>
        <section className="card section">
          <OrderNotes order={order} />
        </section>
      </div>
    </>
  );
}

// What a client user sees: their order's status, shipping and items, read only, with no factory details.
function ClientOrderPage({ order }: { order: Order }) {
  return (
    <>
      <OrdersBackLink order={order} />
      <div className="page-head">
        <div className="title-block">
          <h1 className="mono">{order.margen_order_id}</h1>
          <p className="muted">
            Added {formatDate(order.created_at)}
            {archivedNote(order)}
          </p>
        </div>
      </div>
      {/* One full-width card per row: the details read across, the items below. */}
      <div className="detail-grid stacked">
        <section className="card section">
          <h2>Details</h2>
          <dl className="details across">
            {detail("Order status", <OrderBadge status={order.order_status} />)}
            {detail("Production status", <ProductionBadge status={order.production_status} />)}
            {shippingDetails(order)}
          </dl>
        </section>
        <section className="card section">
          <OrderLines order={order} editing={false} canEdit={false} />
        </section>
      </div>
    </>
  );
}
