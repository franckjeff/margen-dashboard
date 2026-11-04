import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Logo } from "../../components/Layout";
import { Optional, SizeOptions } from "../../components/ui";
import { SIZES } from "../../lib/constants";
import { formValues } from "../../lib/forms";
import { downloadSheet, readFirstSheet } from "../../lib/spreadsheet";
import { DbError, messageOf, supabase } from "../../lib/supabase";
import { linesFromSheet, mergeLines, MAX_QUANTITY, TEMPLATE_COLUMNS, templateRows, type EntryItem, type EntryLine } from "./orderTemplate";

// The public Order Entry page (#/order): anyone can send an order request without signing in.
// It reads only item names and sends the request through one database function; admins see
// the requests on the Order requests page.
export function OrderEntryPage() {
  const items = useQuery({
    queryKey: ["orderEntryItems"],
    queryFn: async (): Promise<EntryItem[]> => {
      const { data, error } = await supabase.rpc("order_entry_items");
      if (error) throw new DbError(error);
      return data;
    },
  });
  const [sentTo, setSentTo] = useState<{ organization: string; email: string } | null>(null);

  return (
    <div className="public-page">
      <header className="public-head">
        <Logo />
        <span className="tagline">Order entry</span>
      </header>
      <main className="public-main">
        {sentTo ? (
          <section className="card section public-done">
            <h1>Thank you</h1>
            <p>
              We've received the order request from <strong>{sentTo.organization}</strong>. We'll be in touch at{" "}
              <strong>{sentTo.email}</strong> to confirm it.
            </p>
            <button type="button" className="primary" onClick={() => setSentTo(null)}>
              Send another order
            </button>
          </section>
        ) : items.isPending ? (
          <p className="empty">Loading…</p>
        ) : items.isError ? (
          <p className="notice error">The order form couldn't load: {messageOf(items.error)}. Please refresh the page.</p>
        ) : (
          <OrderEntryForm items={items.data} onSent={setSentTo} />
        )}
      </main>
    </div>
  );
}

function OrderEntryForm({ items, onSent }: { items: EntryItem[]; onSent: (sent: { organization: string; email: string }) => void }) {
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The line being added.
  const [itemId, setItemId] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");

  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? "Unknown item";
  const sorted = [...lines].sort((a, b) => nameOf(a.item_id).localeCompare(nameOf(b.item_id)) || SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
  const pieces = lines.reduce((sum, l) => sum + l.quantity, 0);

  function addLine() {
    const n = Number(quantity);
    if (!itemId || !size) return setError("Choose an item and a size.");
    if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) return setError(`Enter a quantity from 1 to ${MAX_QUANTITY}.`);
    setLines((current) => mergeLines(current, [{ item_id: itemId, size, quantity: n }]));
    setError(null);
    setQuantity("");
    setSize("");
  }

  async function downloadTemplate() {
    try {
      await downloadSheet("margen-order-template.xlsx", "Order", TEMPLATE_COLUMNS, templateRows(items));
    } catch (problem) {
      setError(`Couldn't create the template: ${messageOf(problem)}`);
    }
  }

  async function readTemplate(file: File) {
    try {
      const read = linesFromSheet(await readFirstSheet(file), items);
      setFileProblems(read.errors);
      if (read.lines.length) {
        setLines((current) => mergeLines(current, read.lines));
        setFileName(file.name);
      }
      setError(null);
    } catch (problem) {
      setFileProblems([]);
      setError(problem instanceof Error && problem.message.startsWith("This file") ? problem.message : `Couldn't read ${file.name}: ${messageOf(problem)}`);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    const v = formValues(event);
    if (!lines.length) return setError("Add at least one item, or upload the order template.");
    setBusy(true);
    // Blank optional fields are sent as "": the database stores them as empty.
    const { error: failed } = await supabase.rpc("submit_order_request", {
      organization_name: v.organization_name,
      contact_name: v.contact_name,
      email: v.email,
      phone: v.phone ?? "",
      notes: v.notes ?? "",
      file_name: fileName ?? "",
      lines,
      website: v.website ?? "",
    });
    setBusy(false);
    if (failed) return setError(`Your order wasn't sent: ${failed.message}`);
    onSent({ organization: v.organization_name.trim(), email: v.email.trim() });
  }

  return (
    <form className="stack" onSubmit={send}>
      <div>
        <h1>Place an order</h1>
        <p className="muted">Tell us who you are and what you need. We'll confirm your order by email.</p>
      </div>

      <section className="card section stack">
        <h2>Your details</h2>
        <label>
          Organization or club
          <input name="organization_name" required maxLength={200} autoComplete="organization" />
        </label>
        <div className="field-row">
          <label>
            Your name
            <input name="contact_name" required maxLength={200} autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required maxLength={320} autoComplete="email" />
          </label>
        </div>
        <label>
          <Optional>Phone</Optional>
          <input name="phone" type="tel" maxLength={50} autoComplete="tel" />
        </label>
        {/* A trap for bots: hidden from people and screen readers, so only a bot fills it in. */}
        <label className="trap" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </section>

      <section className="card section stack">
        <h2>Items</h2>
        <div className="line-form">
          <select name="item_id" aria-label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Choose an item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select name="size" aria-label="Size" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">Size</option>
            <SizeOptions />
          </select>
          <input
            type="number"
            className="qty"
            min={1}
            max={MAX_QUANTITY}
            step={1}
            placeholder="Qty"
            aria-label="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            // Enter adds the line rather than sending the whole order.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLine();
              }
            }}
          />
          <button type="button" onClick={addLine}>
            Add
          </button>
        </div>

        <div className="public-upload">
          <p className="muted small">
            Ordering a lot? <button type="button" className="link-button" onClick={downloadTemplate}>Download the order template</button>, fill in
            a quantity for each item and size, then upload it here.
          </p>
          <label>
            <Optional>Upload the filled-in template</Optional>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readTemplate(file);
                event.target.value = "";
              }}
            />
          </label>
          {fileProblems.length > 0 && (
            <div className="notice error">
              <p>Some rows of the file couldn't be used{lines.length ? "; the others were added" : ""}:</p>
              <ul>
                {fileProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {lines.length ? (
          <div className="table-wrap">
            <table className="static">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th className="num">Qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={`${l.item_id}-${l.size}`}>
                    <td>{nameOf(l.item_id)}</td>
                    <td>{l.size}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="ghost small"
                        aria-label={`Remove ${nameOf(l.item_id)} size ${l.size}`}
                        onClick={() => setLines((current) => current.filter((c) => c !== l))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{pieces}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="empty">No items yet.</p>
        )}
      </section>

      <section className="card section stack">
        <h2>Anything else?</h2>
        <label>
          <Optional>Notes</Optional>
          <textarea name="notes" rows={4} maxLength={5000} placeholder="Deadlines, colours, names and numbers to print…" />
        </label>
      </section>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary public-send" disabled={busy}>
        {busy ? "Sending…" : "Send order"}
      </button>
    </form>
  );
}
