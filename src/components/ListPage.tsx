import { createContext, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { plural } from "../lib/format";
import { useUiState } from "../lib/uiState";
import { Count } from "./ui";

export type ListRow = {
  key: string;
  to: string; // the row's own page; clicking anywhere on the row opens it (double-clicking, in a selectable list)
  search: string; // lowercase text the search box matches against
  label?: string; // the row's name, for its tick box ("Select …")
  filteredOut?: boolean; // left out by the list's filters, whatever the search says
  // The values its sortable columns sort by, by column name (see SortHeader). Empty ones go last.
  sort?: Record<string, SortValue>;
  // In a list with Delete: why this row can't be deleted, which greys out its tick box; null when it can.
  blocker?: string | null;
  cells: ReactNode;
};

export type SortValue = string | number | null | undefined;
type ListSort = { column: string; descending: boolean };
const SortContext = createContext<{ sort: ListSort; setSort: (sort: ListSort) => void } | null>(null);

// A column name that sorts the list when clicked, and reverses it when clicked again, with an arrow showing the
// order. Text starts A to Z; dates and numbers (firstDescending) start newest or biggest first.
export function SortHeader({
  column,
  children,
  className,
  firstDescending = false,
}: {
  column: string;
  children: ReactNode;
  className?: string;
  firstDescending?: boolean;
}) {
  const context = useContext(SortContext);
  if (!context) return <th className={className}>{children}</th>;
  const { sort, setSort } = context;
  const active = sort.column === column;
  return (
    <th className={className} aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className="sort-button"
        onClick={() => setSort(active ? { column, descending: !sort.descending } : { column, descending: firstDescending })}
      >
        {children}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.descending ? "▼" : "▲") : "↕"}
        </span>
      </button>
    </th>
  );
}

// Rows in the chosen column's order, empty values last either way; equal ones keep the page's own order.
function sortRows(rows: ListRow[], { column, descending }: ListSort) {
  if (!column) return rows;
  const empty = (v: SortValue) => v === null || v === undefined || v === "";
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row.sort?.[column];
      const y = b.row.sort?.[column];
      if (empty(x) || empty(y)) return Number(empty(x)) - Number(empty(y)) || a.index - b.index;
      const order =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return (descending ? -order : order) || a.index - b.index;
    })
    .map(({ row }) => row);
}

// Tick boxes in front of each row and a Delete button beside Add, for the rows ticked. The page asks
// for confirmation and deletes them; rows that can't be deleted (ListRow.blocker) can't be ticked.
export type ListDeletion = {
  nouns: string; // e.g. "athletes", for "Select all athletes shown"
  busy: boolean;
  // Confirms, then deletes the ticked rows; done() clears the ticks once it's finished.
  onDelete: (keys: string[], done: () => void) => void;
};

// Filters rows by a search string; rows stay mounted, so the search box keeps focus while typing.
export function useSearch() {
  const [query, setQuery] = useState("");
  const matches = (text: string) => text.includes(query.trim().toLowerCase());
  return { query, setQuery, matches };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      className="search"
      placeholder={placeholder}
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

// Rows the user can select like in a spreadsheet, with a total of the selected rows shown at the bottom.
export type ListSelection = {
  noun: string; // e.g. "order"
  summary: (keys: string[]) => ReactNode; // e.g. the pieces in the selected orders
};

// Highlighted rows, selected like in Excel: a click selects one row, dragging or Shift-click selects a range
// from the row clicked first, and Ctrl (Cmd on a Mac) adds or removes rows. Esc clears the selection.
function useRowSelection(visibleKeys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  // While the mouse button is down: the rows selected before the drag, which the dragged range adds to.
  const dragBase = useRef<Set<string> | null>(null);

  const between = (a: string, b: string) => {
    const i = visibleKeys.indexOf(a);
    const j = visibleKeys.indexOf(b);
    return i < 0 || j < 0 ? [b] : visibleKeys.slice(Math.min(i, j), Math.max(i, j) + 1);
  };

  const clear = () => {
    setSelected(new Set());
    anchor.current = null;
  };

  useEffect(() => {
    const stopDragging = () => (dragBase.current = null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("mouseup", stopDragging);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const press = (key: string, { range, add }: { range: boolean; add: boolean }) => {
    const base = add ? new Set(selected) : new Set<string>();
    if (range && anchor.current) {
      dragBase.current = base;
      setSelected(new Set([...base, ...between(anchor.current, key)]));
      return;
    }
    anchor.current = key;
    if (add && selected.has(key)) {
      base.delete(key);
      dragBase.current = null; // Ctrl-click on a selected row just unselects it
      setSelected(base);
      return;
    }
    dragBase.current = base;
    setSelected(new Set([...base, key]));
  };

  const enter = (key: string) => {
    if (dragBase.current && anchor.current) setSelected(new Set([...dragBase.current, ...between(anchor.current, key)]));
  };

  // Only rows still shown count: a row hidden by the search or filters drops out of the total.
  const visibleSelected = visibleKeys.filter((k) => selected.has(k));
  return { selected, visibleSelected, press, enter, clear };
}

export function ListPage({
  title,
  count,
  newTo,
  newLabel,
  placeholder,
  head,
  rows,
  loading,
  actions,
  filters,
  empty = "Nothing here yet.",
  selection,
  search,
  deletion,
  sortKey,
}: {
  title: string;
  count: number;
  // Leave out for a list the user can't add to.
  newTo?: string;
  newLabel?: string;
  placeholder: string;
  head: ReactNode;
  rows: ListRow[];
  loading: ReactNode; // a QueryGate result while loading or failed, or null when the rows are ready
  actions?: ReactNode;
  filters?: ReactNode;
  empty?: string; // shown when there are no rows at all
  selection?: ListSelection;
  // The page's own useSearch(), when it needs to know which rows the search shows.
  search?: ReturnType<typeof useSearch>;
  deletion?: ListDeletion;
  // Where the chosen sort is remembered while moving between pages; the title unless given.
  sortKey?: string;
}) {
  const navigate = useNavigate();
  const ownSearch = useSearch();
  const { query, setQuery, matches } = search ?? ownSearch;
  const visible = (row: ListRow) => !row.filteredOut && matches(row.search);
  const [sort, setSort] = useUiState<ListSort>(`listSort:${sortKey ?? title}`, { column: "", descending: false });
  const sorted = sortRows(rows, sort);
  const rowSelection = useRowSelection(sorted.filter(visible).map((r) => r.key));

  // Ticked rows: only those shown that can be deleted count, and the header box ticks every one of them.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const deletable = rows.filter((r) => visible(r) && !r.blocker);
  const tickedKeys = sorted.filter((r) => visible(r) && !r.blocker && ticked.has(r.key)).map((r) => r.key);
  const allTicked = deletable.length > 0 && tickedKeys.length === deletable.length;
  const tick = (keys: string[], on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  const picked = rowSelection.visibleSelected;
  // A click on a link or a field inside the row is left to it.
  const onControl = (event: MouseEvent) => Boolean((event.target as HTMLElement).closest("a, button, input, select, textarea, label"));

  const table = (tableRows: ListRow[], none: string) =>
    tableRows.length ? (
      <>
        <table className={selection ? "selectable" : undefined}>
          <thead>
            <tr>
              {deletion && (
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select all ${deletion.nouns} shown that can be deleted`}
                    checked={allTicked}
                    ref={(box) => {
                      if (box) box.indeterminate = tickedKeys.length > 0 && !allTicked;
                    }}
                    disabled={deletable.length === 0}
                    onChange={(e) => tick(deletable.map((r) => r.key), e.target.checked)}
                  />
                </th>
              )}
              {head}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr
                key={row.key}
                hidden={!visible(row)}
                className={rowSelection.selected.has(row.key) ? "selected" : undefined}
                aria-selected={selection ? rowSelection.selected.has(row.key) : undefined}
                // In a selectable list a click selects and a double-click opens the row; otherwise a click opens it.
                onMouseDown={(event) => {
                  if (!selection || event.button !== 0 || onControl(event)) return;
                  event.preventDefault(); // no text highlighting while selecting rows
                  rowSelection.press(row.key, { range: event.shiftKey, add: event.ctrlKey || event.metaKey });
                }}
                onMouseEnter={() => selection && rowSelection.enter(row.key)}
                onClick={(event) => {
                  if (!selection && !onControl(event)) navigate(row.to);
                }}
                onDoubleClick={(event) => {
                  if (selection && !onControl(event)) navigate(row.to);
                }}
              >
                {deletion && (
                  // A click beside the box doesn't open the row.
                  <td className="check-cell" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.label ?? row.key}`}
                      disabled={Boolean(row.blocker)}
                      title={row.blocker ?? undefined}
                      checked={ticked.has(row.key) && !row.blocker}
                      onChange={(e) => tick([row.key], e.target.checked)}
                    />
                  </td>
                )}
                {row.cells}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="empty no-match" hidden={tableRows.some(visible)}>
          No matches.
        </p>
      </>
    ) : (
      <p className="empty">{none}</p>
    );

  const bar = selection && rows.length > 0 && !loading && (
    <div className="selection-bar" role="status">
      {picked.length ? (
        <>
          <span>
            <strong>{plural(picked.length, `${selection.noun} selected`, `${selection.noun}s selected`)}</strong>
            {" · "}
            {selection.summary(picked)}
          </span>
          <button type="button" className="ghost small" onClick={rowSelection.clear}>
            Clear
          </button>
        </>
      ) : (
        <span className="muted small">Click rows to select them: drag or Shift-click for a range, Ctrl-click to add one. Double-click to open.</span>
      )}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <h1>
          {title} <Count n={count} />
        </h1>
        {filters}
        <SearchBox value={query} onChange={setQuery} placeholder={placeholder} />
        {actions}
        {deletion && (
          <div className="user-actions" role="group" aria-label={`Selected ${deletion.nouns}`}>
            {tickedKeys.length > 0 && <span className="muted small">{tickedKeys.length} selected</span>}
            <button
              type="button"
              className="danger"
              disabled={deletion.busy || tickedKeys.length === 0}
              onClick={() => deletion.onDelete(tickedKeys, () => setTicked(new Set()))}
            >
              Delete
            </button>
          </div>
        )}
        {newTo && (
          <Link to={newTo} className="button primary">
            {newLabel}
          </Link>
        )}
      </div>
      <div className="layout">
        <section className="card list">
          {loading ?? <SortContext.Provider value={{ sort, setSort }}>{table(sorted, empty)}</SortContext.Provider>}
          {bar}
        </section>
      </div>
    </>
  );
}
