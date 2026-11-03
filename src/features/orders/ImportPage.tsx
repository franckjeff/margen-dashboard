import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useNotice } from "../../components/Notice";
import { BackLink, OrDash, QueryGate } from "../../components/ui";
import { invalidate } from "../../data/mutations";
import { useOrders, useOrganizations, type Order, type Organization } from "../../data/queries";
import { plural } from "../../lib/format";
import { downloadSheet, readFirstSheet } from "../../lib/spreadsheet";
import { messageOf, supabase } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";
import { CHANGE_LABELS, IMPORT_TEMPLATE, checkImportRows, sheetToRows, type CheckedRow, type OrderChange, type RawRow } from "./importRows";

// The file being checked stays put while the user moves between pages.
type Preview = { fileName: string; raw: RawRow[] } | null;

export function ImportPage() {
  const orders = useOrders();
  const organizations = useOrganizations();
  const [preview, setPreview] = useUiState<Preview>("importPreview", null);
  const { notify, clear } = useNotice();

  async function downloadTemplate() {
    try {
      await downloadSheet("margen-orders-template.xlsx", "Orders", IMPORT_TEMPLATE[0].map((h) => [h, 20]), IMPORT_TEMPLATE.slice(1));
    } catch (error) {
      notify("error", `Couldn't create the template: ${messageOf(error)}`);
    }
  }

  async function readFile(file: File) {
    try {
      setPreview({ fileName: file.name, raw: sheetToRows(await readFirstSheet(file), file.name) });
      clear();
    } catch (error) {
      notify("error", error instanceof Error && error.message.startsWith(file.name) ? error.message : `Couldn't read ${file.name}: ${messageOf(error)}`);
    }
  }

  return (
    <>
      <BackLink to="/customs">Customs</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>Import orders</h1>
          <p className="muted">Orders whose Margen order ID already exists are updated. The others are added.</p>
        </div>
        <button type="button" onClick={downloadTemplate}>
          Download template
        </button>
      </div>
      <div className="stack">
        <section className="card section">
          <label>
            Excel or CSV file
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
              }}
            />
          </label>
          <p className="muted small import-help">
            The first sheet is read. Columns: <strong>Margen order ID</strong> (required), Factory order ID, Organization (its exact
            name), Order status and Production status. Blank cells leave an existing order's value as it is; write "Not started" to
            clear a production status.
          </p>
        </section>
        {preview && (
          <QueryGate queries={[orders, organizations]}>
            {() => (
              <ImportPreview
                preview={preview}
                orders={orders.data!}
                organizations={organizations.data!}
                onClear={() => setPreview(null)}
              />
            )}
          </QueryGate>
        )}
      </div>
    </>
  );
}

function ImportPreview({
  preview,
  orders,
  organizations,
  onClear,
}: {
  preview: NonNullable<Preview>;
  orders: Order[];
  organizations: Organization[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useNotice();
  // Checked against the latest orders, so a failed import shows what is left to do.
  const rows = checkImportRows(preview.raw, orders, organizations);
  const count = (action: CheckedRow["action"]) => rows.filter((r) => r.action === action).length;
  const ready = count("new") + count("update");

  const run = useMutation({
    mutationFn: async () => {
      const added = rows
        .filter((r) => r.action === "new")
        .map((r) => ({
          margen_order_id: r.margen_order_id,
          factory_order_id: null,
          organization_id: null,
          order_status: "received",
          production_status: null,
          ...r.change,
        }));
      const updates = rows.filter((r): r is CheckedRow & { existing: Order } => r.action === "update" && Boolean(r.existing));
      const failures: string[] = [];
      // New orders go in as one insert, so they are all added or none are.
      if (added.length) {
        const { error } = await supabase.from("orders").insert(added);
        if (error) failures.push(`the new orders weren't added (${error.message})`);
      }
      for (const r of updates) {
        const { error } = await supabase.from("orders").update(r.change satisfies OrderChange).eq("id", r.existing.id);
        if (error) failures.push(`${r.margen_order_id} wasn't updated (${error.message})`);
      }
      await invalidate(queryClient, "orders");
      return { added: added.length, updated: updates.length, failures };
    },
    onSuccess: ({ added, updated, failures }) => {
      if (failures.length) return notify("error", `Import incomplete: ${failures.join("; ")}.`);
      const parts = [added && `added ${plural(added, "order")}`, updated && `updated ${updated}`].filter(Boolean);
      onClear();
      notify("success", `Import done: ${parts.join(" and ")}.`, { keep: true });
      navigate("/customs");
    },
    onError: (error) => notify("error", `Import failed: ${messageOf(error)}`),
  });

  const summary = (
    [
      [count("new"), "new"],
      [count("update"), "to update"],
      [count("same"), "unchanged"],
      [count("error"), "with problems, skipped"],
    ] as const
  )
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");

  const result = (r: CheckedRow) =>
    ({
      new: <span className="status tone-accent">New</span>,
      update: (
        <>
          <span className="status tone-success">Update</span>{" "}
          <span className="muted small">
            {(Object.keys(r.change) as (keyof OrderChange)[]).map((f) => CHANGE_LABELS[f]).join(", ")}
          </span>
        </>
      ),
      same: <span className="muted small">No change</span>,
      error: <span className="error-text small">{r.errors.join(". ")}</span>,
    })[r.action];

  return (
    <section className="card section">
      <div className="panel-head">
        <div>
          <h2>{preview.fileName}</h2>
          <p className="muted small">
            {plural(rows.length, "row")}: {summary}
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th className="num">Row</th>
              <th>Margen order ID</th>
              <th className="hide-sm">Factory order ID</th>
              <th className="hide-sm">Organization</th>
              <th className="hide-sm">Order status</th>
              <th className="hide-sm">Production</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line} className={r.action === "error" ? "row-error" : undefined}>
                <td className="muted num">{r.line}</td>
                <td className="mono">
                  <OrDash>{r.margen_order_id}</OrDash>
                </td>
                <td className="mono hide-sm">
                  <OrDash>{r.factory_order_id}</OrDash>
                </td>
                <td className="hide-sm">
                  <OrDash>{r.organization}</OrDash>
                </td>
                <td className="hide-sm">
                  <OrDash>{r.order_status}</OrDash>
                </td>
                <td className="hide-sm">
                  <OrDash>{r.production_status}</OrDash>
                </td>
                <td>{result(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions import-actions">
        <button type="button" className="primary" disabled={!ready || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Importing…" : ready ? `Import ${plural(ready, "order")}` : "Nothing to import"}
        </button>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </div>
    </section>
  );
}
