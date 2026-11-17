import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { plural } from "../lib/format";
import { ChevronIcon } from "./icons";
import { Count } from "./ui";

export type ListRow = {
  key: string;
  to: string; // the row's own page; clicking anywhere on the row opens it (double-clicking, in a selectable list)
  search: string; // lowercase text the search box matches against
  filteredOut?: boolean; // left out by the list's filters, whatever the search says
  group?: string; // which grid the row sits in, for a list split into groups
  cells: ReactNode;
};

// A list can be split into grids, one card each, in this order; a row goes in the grid named by its group.
export type ListGroup = { key: string; title: string; empty?: string };

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

// Which grids of a list are collapsed, remembered in this browser between visits.
function useCollapsedGroups(list: string) {
  const storageKey = `list-collapsed:${list}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (group: string) => {
    const next = new Set(collapsed);
    if (!next.delete(group)) next.add(group);
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Not remembered, e.g. in a private window; the grid still collapses.
    }
  };
  return { collapsed, toggle };
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
  panel,
  actions,
  filters,
  empty = "Nothing here yet.",
  selection,
  groups,
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
  panel?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  empty?: string; // shown when there are no rows at all
  selection?: ListSelection;
  groups?: ListGroup[];
}) {
  const navigate = useNavigate();
  const { query, setQuery, matches } = useSearch();
  const visible = (row: ListRow) => !row.filteredOut && matches(row.search);
  // Grouped rows in grid order, so a range selected across grids follows what's on screen.
  const inGroup = (g: ListGroup) => rows.filter((r) => r.group === g.key);
  const { collapsed, toggle } = useCollapsedGroups(title);
  // Rows in a collapsed grid can't be selected, and drop out of the selection's total.
  const ordered = groups ? groups.filter((g) => !collapsed.has(g.key)).flatMap(inGroup) : rows;
  const rowSelection = useRowSelection(ordered.filter(visible).map((r) => r.key));
  const picked = rowSelection.visibleSelected;
  // A click on a link or a field inside the row is left to it.
  const onControl = (event: MouseEvent) => Boolean((event.target as HTMLElement).closest("a, button, input, select, textarea, label"));

  const table = (tableRows: ListRow[], none: string) =>
    tableRows.length ? (
      <>
        <table className={selection ? "selectable" : undefined}>
          <thead>
            <tr>{head}</tr>
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
        {newTo && (
          <Link to={newTo} className="button primary">
            {newLabel}
          </Link>
        )}
      </div>
      <div className={`layout${panel ? " has-panel" : ""}`}>
        {groups && !loading && rows.length > 0 ? (
          <div className="list-groups">
            {groups.map((g) => {
              const groupRows = inGroup(g);
              const open = !collapsed.has(g.key);
              const id = `list-group-${g.key}`;
              return (
                <section key={g.key} className={`card list list-group${open ? " open" : ""}`} aria-label={g.title}>
                  <h2 className="list-group-title">
                    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => toggle(g.key)}>
                      <ChevronIcon />
                      {g.title} <Count n={groupRows.filter(visible).length} />
                    </button>
                  </h2>
                  <div id={id} hidden={!open}>
                    {table(groupRows, g.empty ?? "None.")}
                  </div>
                </section>
              );
            })}
            {bar && <div className="card list-groups-bar">{bar}</div>}
          </div>
        ) : (
          <section className="card list">
            {loading ?? table(rows, empty)}
            {bar}
          </section>
        )}
        {panel && <aside className="card panel">{panel}</aside>}
      </div>
    </>
  );
}
