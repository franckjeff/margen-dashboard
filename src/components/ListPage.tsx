import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Count } from "./ui";

export type ListRow = {
  key: string;
  to: string; // the row's own page; clicking anywhere on the row opens it
  search: string; // lowercase text the search box matches against
  filteredOut?: boolean; // left out by the list's filters, whatever the search says
  cells: ReactNode;
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
}) {
  const navigate = useNavigate();
  const { query, setQuery, matches } = useSearch();
  const visible = (row: ListRow) => !row.filteredOut && matches(row.search);

  const body =
    loading ??
    (rows.length ? (
      <>
        <table>
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                hidden={!visible(row)}
                // Whole rows act as links; a click on a link or a field inside the row is left to it.
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest("a, button, input, select, textarea, label")) navigate(row.to);
                }}
              >
                {row.cells}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="empty no-match" hidden={rows.some(visible)}>
          No matches.
        </p>
      </>
    ) : (
      <p className="empty">{empty}</p>
    ));

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
        <section className="card list">{body}</section>
        {panel && <aside className="card panel">{panel}</aside>}
      </div>
    </>
  );
}
