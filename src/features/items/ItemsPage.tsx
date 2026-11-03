import { Link } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, Dash, FormButtons, Missing, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useItems, useOrderItems, useOrders, type Item } from "../../data/queries";
import { formatDate, plural } from "../../lib/format";
import { deleteMessage, formValues } from "../../lib/forms";
import { sortBySize } from "../orders/lines";

function ItemForm({ item }: { item?: Item }) {
  const save = useSaveRecord("items");
  const { notify } = useNotice();
  const back = item ? `/items/${item.id}` : "/items";
  return (
    <>
      <PanelHead title={item ? "Edit item" : "New item"} close={back} />
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = { item_code: v.item_code, name: v.name };
          if (!row.item_code || !row.name) return notify("error", "The item needs an ID and a name.");
          save.mutate({ row, id: item?.id, label: row.name });
        }}
      >
        <label>
          Item ID
          <input name="item_code" required autoFocus autoComplete="off" className="mono" defaultValue={item?.item_code} placeholder="e.g. WMN-RACERBACK" />
        </label>
        <label>
          Name
          <input name="name" required autoComplete="off" defaultValue={item?.name} placeholder="e.g. Women's Racerback" />
        </label>
        <FormButtons label={item ? "Save changes" : "Create item"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

export function ItemsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const items = useItems();
  const orderItems = useOrderItems();

  if (id && id !== "new") {
    return (
      <QueryGate queries={[items]}>
        {() => {
          const item = items.data!.find((i) => i.id === id);
          return item ? <ItemPage item={item} editing={editing} /> : <Missing back="/items" backLabel="Items" what="item" />;
        }}
      </QueryGate>
    );
  }

  const all = items.data ?? [];
  const lines = orderItems.data ?? [];
  return (
    <ListPage
      title="Items"
      count={all.length}
      newTo="/items/new"
      newLabel="New item"
      placeholder="Search items"
      loading={loadingState([items, orderItems])}
      head={
        <>
          <th>Item ID</th>
          <th>Name</th>
          <th className="num hide-sm">Orders</th>
          <th className="num">Pieces ordered</th>
        </>
      }
      rows={all.map((i) => {
        const own = lines.filter((l) => l.item_id === i.id);
        const orders = new Set(own.map((l) => l.order_id)).size;
        const pieces = own.reduce((sum, l) => sum + l.quantity, 0);
        return {
          key: i.id,
          to: `/items/${i.id}`,
          search: `${i.item_code} ${i.name}`.toLowerCase(),
          cells: (
            <>
              <td>
                <Link to={`/items/${i.id}`} className="strong mono">
                  {i.item_code}
                </Link>
              </td>
              <td>{i.name}</td>
              <td className="num hide-sm">{orders || <Dash />}</td>
              <td className="num">{pieces || <Dash />}</td>
            </>
          ),
        };
      })}
      panel={id === "new" ? <ItemForm /> : undefined}
    />
  );
}

function ItemPage({ item, editing }: { item: Item; editing: boolean }) {
  const remove = useDeleteRecord("items");
  const orderItems = useOrderItems();
  const { notify } = useNotice();

  const confirmDelete = () => {
    // The database refuses to delete an item that orders use; say so before asking.
    const orders = new Set((orderItems.data ?? []).filter((l) => l.item_id === item.id).map((l) => l.order_id)).size;
    if (orders) {
      return notify("error", `${item.name} is on ${plural(orders, "order")}, so it can't be deleted. Remove it from those orders first.`);
    }
    if (confirm(deleteMessage(item.name))) remove.mutate({ id: item.id, label: item.name });
  };

  return (
    <>
      <BackLink to="/items">Items</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{item.name}</h1>
          <p className="muted mono">{item.item_code}</p>
        </div>
        {!editing && (
          <>
            <Link to={`/items/${item.id}/edit`} className="button">
              Edit
            </Link>
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending || orderItems.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="detail-grid">
        <section className="card section">
          {editing ? (
            <ItemForm item={item} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
                <div>
                  <dt>Item ID</dt>
                  <dd className="mono">{item.item_code}</dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd>{item.name}</dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(item.created_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <ItemOrders item={item} />
        </section>
      </div>
    </>
  );
}

// The orders this item is on, with how many of each size.
function ItemOrders({ item }: { item: Item }) {
  const orders = useOrders();
  const orderItems = useOrderItems();
  const waiting = loadingState([orders, orderItems]);
  const rows = (orders.data ?? [])
    .map((order) => ({
      order,
      lines: sortBySize((orderItems.data ?? []).filter((l) => l.order_id === order.id && l.item_id === item.id)),
    }))
    .filter((o) => o.lines.length);

  return (
    <>
      <h2>
        Orders <Count n={rows.length} />
      </h2>
      {waiting ??
        (rows.length ? (
          <div className="table-wrap">
            <table className="static">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Sizes</th>
                  <th className="num">Pieces</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order, lines }) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/customs/${order.id}`} className="strong mono">
                        {order.margen_order_id}
                      </Link>
                    </td>
                    <td>
                      {lines.map((l, i) => (
                        <span key={l.id}>
                          {i > 0 && " · "}
                          {l.size}&nbsp;<span className="muted">×</span>&nbsp;{l.quantity}
                        </span>
                      ))}
                    </td>
                    <td className="num">{lines.reduce((sum, l) => sum + l.quantity, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Not on any order yet.</p>
        ))}
    </>
  );
}
