import { Link, useNavigate } from "react-router";
import { Dialog } from "../../components/Dialog";
import { ListPage, SortHeader } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, Dash, FormButtons, Missing, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { useDeleteRecord, useDeleteRecords, useSaveRecord } from "../../data/mutations";
import { useItems, useOrderItems, useOrders, type Item } from "../../data/queries";
import { formatDate, plural } from "../../lib/format";
import { deleteManyMessage, deleteMessage, formValues } from "../../lib/forms";
import { sortBySize } from "../orders/lines";
import { useConfirm } from "../../components/Confirm";

function ItemForm({ item }: { item?: Item }) {
  const save = useSaveRecord("items");
  const { notify } = useNotice();
  const back = item ? `/items/${item.id}` : "/items";
  return (
    <>
      {item && <PanelHead title="Edit item" close={back} />}
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
        <FormButtons label={item ? "Save changes" : "Add item"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Adding an item happens in a window over the list (#/items/new); it opens the new one's page.
function AddItem() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add item" onClose={() => navigate("/items")}>
      <ItemForm />
    </Dialog>
  );
}

export function ItemsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const ask = useConfirm();
  const items = useItems();
  const orderItems = useOrderItems();
  const removeMany = useDeleteRecords("items", "items");

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
    <>
      {id === "new" && <AddItem />}
      <ListPage
        title="Items"
        count={all.length}
        newTo="/items/new"
        newLabel="Add"
        placeholder="Search items"
        loading={loadingState([items, orderItems])}
        deletion={{
          nouns: "items",
          busy: removeMany.isPending,
          onDelete: async (ids, done) => {
            const picked = all.filter((i) => ids.includes(i.id));
            if (await ask(deleteManyMessage(picked.map((i) => i.name), "items")))
              removeMany.mutate(picked.map((i) => ({ id: i.id, label: i.name })), { onSettled: done });
          },
        }}
        head={
          <>
            <SortHeader column="code">Item ID</SortHeader>
            <SortHeader column="name">Name</SortHeader>
            <SortHeader column="orders" className="num hide-sm" firstDescending>
              Orders
            </SortHeader>
            <SortHeader column="pieces" className="num" firstDescending>
              Pieces ordered
            </SortHeader>
          </>
        }
        rows={all.map((i) => {
          const own = lines.filter((l) => l.item_id === i.id);
          const orders = new Set(own.map((l) => l.order_id)).size;
          const pieces = own.reduce((sum, l) => sum + l.quantity, 0);
          return {
            key: i.id,
            to: `/items/${i.id}`,
            label: i.name,
            sort: { code: i.item_code, name: i.name, orders, pieces },
            // The database refuses to delete an item that orders use.
            blocker: orders ? `${i.name} is on ${plural(orders, "order")}, so it can't be deleted. Remove it from those orders first.` : null,
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
      />
    </>
  );
}

function ItemPage({ item, editing }: { item: Item; editing: boolean }) {
  const ask = useConfirm();
  const remove = useDeleteRecord("items");
  const orderItems = useOrderItems();
  // The database refuses to delete an item that orders use, so Delete is greyed out, saying why.
  const orders = new Set((orderItems.data ?? []).filter((l) => l.item_id === item.id).map((l) => l.order_id)).size;
  const blocker = orderItems.data
    ? orders
      ? `${item.name} is on ${plural(orders, "order")}, so it can't be deleted. Remove it from those orders first.`
      : null
    : "Loading…";

  const confirmDelete = async () => {
    if (await ask(deleteMessage(item.name))) remove.mutate({ id: item.id, label: item.name });
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
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending || Boolean(blocker)} title={blocker ?? undefined}>
              Delete
            </button>
          </>
        )}
      </div>
      {/* Full-width blocks, one under the other, like every record page. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <ItemForm item={item} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details across">
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
