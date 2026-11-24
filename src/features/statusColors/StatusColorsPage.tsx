import { useState } from "react";
import { useDbAction } from "../../data/mutations";
import { statusColorKey, useStatusColors, type StatusColors } from "../../data/queries";
import { QueryGate } from "../../components/ui";
import { builtInColor, textOn } from "../../lib/colors";
import { ORDER_STATUSES, ORDER_TONES, PRODUCTION_STATUSES } from "../../lib/constants";
import { DbError, supabase } from "../../lib/supabase";

type Kind = "order" | "production";
// Unsaved changes: a color, or null to go back to the built-in color.
type Draft = Record<string, string | null>;

const SECTIONS: { kind: Kind; title: string; statuses: Record<string, string>; tone: (status: string) => string }[] = [
  { kind: "order", title: "Order status", statuses: ORDER_STATUSES, tone: (s) => ORDER_TONES[s] },
  { kind: "production", title: "Production status", statuses: PRODUCTION_STATUSES, tone: (s) => (s === "shipped" ? "success" : "accent") },
];

// Writes the changed colors, and removes the ones set back to built-in.
async function saveColors(draft: Draft) {
  const entries = Object.entries(draft);
  const rows = entries
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, background]) => {
      const [kind, status] = key.split(":");
      return { kind, status, background, updated_at: new Date().toISOString() };
    });
  if (rows.length) {
    const { error } = await supabase.from("status_colors").upsert(rows);
    if (error) throw new DbError(error);
  }
  for (const [key] of entries.filter(([, value]) => value === null)) {
    const [kind, status] = key.split(":");
    const { error } = await supabase.from("status_colors").delete().eq("kind", kind).eq("status", status);
    if (error) throw new DbError(error);
  }
}

// Admins choose the color of each status badge; everyone sees the result.
// The database lets only admins change the colors (see the status_colors migration).
export function StatusColorsPage() {
  const colors = useStatusColors();
  return (
    <>
      <div className="page-head">
        <div className="title-block">
          <h1>Status colors</h1>
          <p className="muted">The color of each status badge. Changes apply to every user, admins, factories and clients alike.</p>
        </div>
      </div>
      <QueryGate queries={[colors]}>{() => <ColorsForm saved={colors.data!} />}</QueryGate>
    </>
  );
}

function ColorsForm({ saved }: { saved: StatusColors }) {
  const [draft, setDraft] = useState<Draft>({});
  const save = useDbAction<Draft>({
    tables: ["status_colors"],
    run: saveColors,
    success: () => "Saved the status colors. Everyone sees them now.",
    failure: () => "Couldn't save the status colors",
  });
  const changed = Object.keys(draft).length;
  // The color shown for a status: the unsaved one, else the saved one; null means built-in.
  const current = (key: string) => (key in draft ? draft[key] : (saved[key] ?? null));

  const choose = (key: string, value: string | null) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Back to what's saved: nothing left to save for it.
      if (value === (saved[key] ?? null)) delete next[key];
      return next;
    });

  return (
    <form
      className="stack status-colors"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft, { onSuccess: () => setDraft({}) });
      }}
    >
      {SECTIONS.map(({ kind, title, statuses, tone }) => (
        <section key={kind} className="card section">
          <h2>{title}</h2>
          <div className="table-wrap">
            <table className="static">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Badge</th>
                  <th>Color</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(statuses).map(([status, label]) => {
                  const key = statusColorKey(kind, status);
                  const color = current(key);
                  return (
                    <tr key={key}>
                      <td className="strong">{label}</td>
                      <td>
                        <span
                          className={`status tone-${tone(status)}`}
                          style={color ? { backgroundColor: color, color: textOn(color) } : undefined}
                          data-testid={`badge-${key}`}
                        >
                          {label}
                        </span>
                        {key in draft && <span className="muted small"> · not saved</span>}
                      </td>
                      <td>
                        <input
                          type="color"
                          className="color-input"
                          value={color ?? builtInColor(key)}
                          onChange={(e) => choose(key, e.target.value)}
                          aria-label={`Color for ${title.toLowerCase()} ${label}`}
                        />
                      </td>
                      <td className="num">
                        {color ? (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => choose(key, null)}
                            aria-label={`Use the built-in color for ${title.toLowerCase()} ${label}`}
                          >
                            Use built-in color
                          </button>
                        ) : (
                          <span className="muted small">Built-in color</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!changed || save.isPending}>
          {save.isPending ? "Saving…" : "Save colors"}
        </button>
        <button type="button" disabled={!changed || save.isPending} onClick={() => setDraft({})}>
          Discard changes
        </button>
        {changed > 0 && <span className="muted small">{changed === 1 ? "1 change" : `${changed} changes`} not saved yet.</span>}
      </div>
    </form>
  );
}
