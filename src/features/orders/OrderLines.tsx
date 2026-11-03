import { useRef } from "react";
import { Link } from "react-router";
import { useNotice } from "../../components/Notice";
import { Count } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useItems, useOrderItems, type Order } from "../../data/queries";
import { ADULT_SIZES, JUNIOR_SIZES } from "../../lib/constants";
import { supabase, unwrap } from "../../lib/supabase";
import { orderLinesOf, parseQuantity, type LineWithItem } from "./lines";

const QUANTITY_RULE = "The quantity must be a whole number of 1 or more.";

// What the order is made of: one line per item and size, with its quantity.
// Read-only unless the order is being edited (#/customs/<id>/edit). Factory users can't edit (canEdit false).
export function OrderLines({ order, editing, canEdit = true }: { order: Order; editing: boolean; canEdit?: boolean }) {
  const items = useItems();
  const orderItems = useOrderItems();
  const lines = orderLinesOf(orderItems.data ?? [], items.data ?? [], order.id);
  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  const loading = items.isPending || orderItems.isPending;

  const table = lines.length > 0 && (
    <div className={`table-wrap${editing ? " editing" : ""}`}>
      <table className="static">
        <thead>
          <tr>
            <th>Item</th>
            <th>Size</th>
            <th className="num">Qty</th>
            {editing && (
              <th>
                <span className="sr-only">Remove</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <Link to={`/items/${l.item.id}`} className="strong">
                  {l.item.name}
                </Link>
              </td>
              <td>{l.size}</td>
              {editing ? <EditableLine line={l} /> : <td className="num">{l.quantity}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{total}</td>
            {editing && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const empty = loading
    ? "Loading…"
    : editing || !canEdit
      ? "No items on this order yet."
      : "No items on this order yet. Click Edit to add some.";

  return (
    <>
      <h2>
        Items <Count n={total} />
      </h2>
      {table || <p className="empty">{empty}</p>}
      {editing && (
        <>
          <AddLineForm order={order} />
          <p className="muted small">Item changes are saved as you make them.</p>
        </>
      )}
    </>
  );
}

function EditableLine({ line }: { line: LineWithItem }) {
  const { notify } = useNotice();
  const input = useRef<HTMLInputElement>(null);
  const label = `${line.item.name}, size ${line.size}`;
  // A failed change puts the saved quantity back in the box.
  const restore = () => {
    if (input.current) input.current.value = String(line.quantity);
  };

  const setQuantity = useDbAction({
    tables: ["order_items"],
    run: async ({ quantity }: { from: number; quantity: number }) =>
      unwrap(await supabase.from("order_items").update({ quantity }).eq("id", line.id)),
    success: ({ from, quantity }) => `Quantity changed from ${from} to ${quantity}.`,
    failure: () => "Couldn't change the quantity",
  });
  const remove = useDbAction({
    tables: ["order_items"],
    run: async () =>
      expectRows(
        unwrap(await supabase.from("order_items").delete().eq("id", line.id).select("id")),
        `${line.item.name} wasn't removed. You may not have permission.`,
      ),
    success: () => `Removed ${line.item.name}, size ${line.size}.`,
    failure: () => `Couldn't remove ${line.item.name}`,
  });

  return (
    <>
      <td className="num">
        <input
          ref={input}
          // Remounts with the saved value whenever it changes.
          key={line.quantity}
          type="number"
          className="qty"
          min={1}
          step={1}
          defaultValue={line.quantity}
          disabled={setQuantity.isPending}
          aria-label={`Quantity of ${label}`}
          // Saved when the box is left or Enter is pressed, not on every keystroke.
          onBlur={(event) => {
            const text = event.target.value;
            if (text === String(line.quantity)) return;
            const quantity = parseQuantity(text);
            if (quantity === null) {
              restore();
              return notify("error", `${QUANTITY_RULE} To take an item off the order, use ×.`);
            }
            setQuantity.mutate({ from: line.quantity, quantity }, { onError: restore });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </td>
      <td className="num">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Remove ${label}`}
          title="Remove from order"
          disabled={remove.isPending}
          onClick={() => confirm(`Remove ${line.quantity} × ${label} from this order?`) && remove.mutate(undefined)}
        >
          ×
        </button>
      </td>
    </>
  );
}

// Adds an item in a size to the order; if the order already has that item and size, adds to its quantity.
function AddLineForm({ order }: { order: Order }) {
  const items = useItems();
  const orderItems = useOrderItems();
  const { notify } = useNotice();
  const form = useRef<HTMLFormElement>(null);
  const itemSelect = useRef<HTMLSelectElement>(null);

  // existing: the order's line for the same item and size, as it was when the form was sent.
  type NewLine = { item_id: string; name: string; size: string; quantity: number; existing?: { id: string; quantity: number } };
  const add = useDbAction({
    tables: ["order_items"],
    run: async ({ item_id, size, quantity, existing }: NewLine) =>
      unwrap(
        existing
          ? await supabase.from("order_items").update({ quantity: existing.quantity + quantity }).eq("id", existing.id)
          : await supabase.from("order_items").insert({ order_id: order.id, item_id, size, quantity }),
      ),
    success: ({ name, size, quantity, existing }) =>
      existing
        ? `Added ${quantity} more ${name}, size ${size} (now ${existing.quantity + quantity}).`
        : `Added ${quantity} × ${name}, size ${size}.`,
    failure: ({ name }) => `Couldn't add ${name}`,
  });

  if (!items.data?.length) {
    return (
      <p className="muted small">
        {items.isPending ? (
          "Loading…"
        ) : (
          <>
            No items yet. <Link to="/items/new">Add an item</Link> first.
          </>
        )}
      </p>
    );
  }

  return (
    <form
      ref={form}
      className="line-form"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const quantity = parseQuantity(String(values.get("quantity")));
        if (quantity === null) return notify("error", QUANTITY_RULE);
        const item_id = String(values.get("item_id"));
        const size = String(values.get("size"));
        const name = items.data?.find((i) => i.id === item_id)?.name ?? "the item";
        const existing = orderItems.data?.find((l) => l.order_id === order.id && l.item_id === item_id && l.size === size);
        add.mutate(
          { item_id, name, size, quantity, existing },
          {
            // Ready for the next line.
            onSuccess: () => {
              form.current?.reset();
              setTimeout(() => itemSelect.current?.focus());
            },
          },
        );
      }}
    >
      <select ref={itemSelect} name="item_id" required aria-label="Item" defaultValue="">
        <option value="">Choose an item…</option>
        {items.data.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <select name="size" required aria-label="Size" defaultValue="">
        <option value="">Size</option>
        <optgroup label="Adult">
          {ADULT_SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </optgroup>
        <optgroup label="Junior">
          {JUNIOR_SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </optgroup>
      </select>
      <input type="number" name="quantity" min={1} step={1} required placeholder="Qty" aria-label="Quantity" className="qty" />
      <button type="submit" className="primary" disabled={add.isPending}>
        Add
      </button>
    </form>
  );
}
