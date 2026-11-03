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
import { ORDER_STATUSES, PRODUCTION_STATUSES, productionLabel } from "../../lib/constants";
import type { TablesUpdate } from "../../lib/database.types";
import { formatDate, formatDay, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";
import { ImportPage } from "./ImportPage";
import { piecesIn } from "./lines";
import { OrderHistory } from "./OrderHistory";
import { OrderLines } from "./OrderLines";

const OrderOrganization = ({ order }: { order: Order }) =>
  order.organization ? <Link to={`/organizations/${order.organization.id}`}>{order.organization.name}</Link> : <Dash />;

const OrderFactory = ({ order }: { order: Order }) =>
  order.factory ? <Link to={`/factories/${order.factory.id}`}>{order.factory.name}</Link> : <span className="muted">Not assigned</span>;

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

// The factory choices; new orders start with no factory until an admin assigns one.
function FactoryOptions() {
  const factories = useFactories();
  return (
    <>
      <option value="">Not assigned</option>
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
            factory_id: orNull(v.factory_id),
            order_status: v.order_status,
            production_status: orNull(v.production_status),
            ...shippingRow(v),
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
        <label>
          <Optional>Factory</Optional>
          <select name="factory_id" key={factories.data ? "ready" : "loading"} defaultValue={order?.factory_id ?? ""}>
            <FactoryOptions />
          </select>
        </label>
        <div className="field-row">
          <label>
            Order status
            <select name="order_status" defaultValue={order?.order_status ?? "received"}>
              <Options labels={ORDER_STATUSES} />
            </select>
          </label>
          <label>
            Production status
            <select name="production_status" defaultValue={order?.production_status ?? ""}>
              <Options labels={PRODUCTION_STATUSES} emptyLabel="Not started" />
            </select>
          </label>
        </div>
        <ShippingFields order={order} />
        <FormButtons label={order ? "Save changes" : "Create order"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Orders live under the Customs menu (#/customs), but in the "orders" table.
// Factory users see the same pages without client details, and change only production and shipping;
// the database only returns their factory's orders.
export function OrdersPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const orders = useOrders();
  const orderItems = useOrderItems();
  const factoryView = useSignedIn().role !== "admin";

  if (factoryView && (id === "import" || id === "new" || editing)) return <Navigate to={id === "import" || id === "new" ? "/customs" : `/customs/${id}`} replace />;
  if (id === "import") return <ImportPage />;
  if (id && id !== "new") {
    return (
      <QueryGate queries={[orders]}>
        {() => {
          const order = orders.data!.find((o) => o.id === id);
          if (!order) return <Missing back="/customs" backLabel="Customs" what="order" />;
          return factoryView ? <FactoryOrderPage order={order} /> : <OrderPage order={order} editing={editing} />;
        }}
      </QueryGate>
    );
  }

  const all = orders.data ?? [];
  const lines = orderItems.data ?? [];
  return (
    <ListPage
      title="Customs"
      count={all.length}
      newTo={factoryView ? undefined : "/customs/new"}
      newLabel="New order"
      placeholder="Search orders"
      loading={loadingState([orders, orderItems])}
      empty={factoryView ? "No orders are assigned to your factory yet." : undefined}
      actions={
        !factoryView && (
          <Link to="/customs/import" className="button">
            Import from Excel
          </Link>
        )
      }
      head={
        <>
          <th>Margen order ID</th>
          <th className="hide-sm">Factory order ID</th>
          {!factoryView && <th className="hide-sm">Organization</th>}
          {!factoryView && <th className="hide-sm">Factory</th>}
          <th>Order status</th>
          <th>Production</th>
          <th className={factoryView ? undefined : "hide-sm"}>Est. shipping</th>
          <th className="num hide-sm">Pieces</th>
        </>
      }
      rows={all.map((o) => ({
        key: o.id,
        to: `/customs/${o.id}`,
        search: `${o.margen_order_id} ${o.factory_order_id ?? ""} ${o.organization?.name ?? ""} ${o.factory?.name ?? ""} ${ORDER_STATUSES[o.order_status]} ${productionLabel(
          o.production_status,
        )}`.toLowerCase(),
        cells: (
          <>
            <td>
              <Link to={`/customs/${o.id}`} className="strong mono">
                {o.margen_order_id}
              </Link>
            </td>
            <td className="mono hide-sm">
              <OrDash>{o.factory_order_id}</OrDash>
            </td>
            {!factoryView && (
              <td className="hide-sm">
                <OrderOrganization order={o} />
              </td>
            )}
            {!factoryView && (
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
                <td className="hide-sm">
                  <ShipDay day={o.estimated_ship_date} />
                </td>
              </>
            )}
            <td className="num hide-sm">{piecesIn(lines, o.id) || <Dash />}</td>
          </>
        ),
      }))}
      panel={id === "new" ? <OrderForm /> : undefined}
    />
  );
}

// Fields changed in place: from an order page's header, or in the factory's Customs list.
type QuickField = "order_status" | "production_status" | "factory_id" | "estimated_ship_date";
const QUICK_CHANGES: Record<QuickField, (value: string) => TablesUpdate<"orders">> = {
  order_status: (value) => ({ order_status: value }),
  production_status: (value) => ({ production_status: value || null }),
  factory_id: (value) => ({ factory_id: value || null }),
  estimated_ship_date: (value) => ({ estimated_ship_date: value || null }),
};

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
        <Options labels={PRODUCTION_STATUSES} emptyLabel="Not started" />
      </select>
    </label>
  );
}

// The factory's Production and Est. shipping cells in the Customs list, each saved as soon as it changes.
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
          <Options labels={PRODUCTION_STATUSES} emptyLabel="Not started" />
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
      <BackLink to="/customs">Customs</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1 className="mono">{order.margen_order_id}</h1>
          <p className="muted">{order.factory_order_id ? `Factory order ${order.factory_order_id}` : "No factory order ID yet"}</p>
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
                <Options labels={ORDER_STATUSES} />
              </select>
            </label>
            <label className="inline-select">
              Factory
              <select
                aria-label="Factory"
                value={order.factory_id ?? ""}
                disabled={setField.isPending || factories.isPending}
                onChange={(e) => setField.mutate({ field: "factory_id", value: e.target.value })}
              >
                <FactoryOptions />
              </select>
            </label>
            <ProductionSelect order={order} setField={setField} />
            <Link to={`/customs/${order.id}/edit`} className="button">
              Edit
            </Link>
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
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
          <OrderHistory orderId={order.id} />
        </section>
      </div>
    </>
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
      <BackLink to="/customs">Customs</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1 className="mono">{order.margen_order_id}</h1>
          <p className="muted">{order.factory_order_id ? `Factory order ${order.factory_order_id}` : "No factory order ID yet"}</p>
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
      </div>
    </>
  );
}
