import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ADULT_SIZES, JUNIOR_SIZES, LEAD_STATUSES, ORDER_STATUSES, ORDER_TONES, PRODUCTION_STATUSES } from "../lib/constants";
import { formatDateTime } from "../lib/format";
import { messageOf } from "../lib/supabase";

export const Dash = () => <span className="muted">—</span>;

// Text, or a dash when it's empty.
export const OrDash = ({ children }: { children?: string | null }) => (children ? <>{children}</> : <Dash />);

export const Count = ({ n }: { n: number }) => <span className="count">{n}</span>;

// What to show while queries load: the first error, "Loading…", or null once all have data.
export function loadingState(queries: UseQueryResult[]): ReactNode {
  const failed = queries.find((q) => q.isError);
  if (failed) return <p className="notice error">Couldn't load data: {messageOf(failed.error)}</p>;
  if (queries.some((q) => q.isPending)) return <p className="empty">Loading…</p>;
  return null;
}

// Renders children once every query has its data.
export function QueryGate({ queries, children }: { queries: UseQueryResult[]; children: () => ReactNode }) {
  return loadingState(queries) ?? <>{children()}</>;
}

export const BackLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="back">
    ← {children}
  </Link>
);

// A record page whose record isn't there (wrong link, or deleted).
export function Missing({ back, backLabel, what }: { back: string; backLabel: string; what: string }) {
  return (
    <>
      <BackLink to={back}>{backLabel}</BackLink>
      <section className="card">
        <p className="empty">This {what} doesn't exist or was deleted.</p>
      </section>
    </>
  );
}

export function PanelHead({ title, close }: { title: string; close: string }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      <Link to={close} className="icon-btn" aria-label="Close">
        ×
      </Link>
    </div>
  );
}

export function FormButtons({ label, cancel, busy }: { label: string; cancel: string; busy: boolean }) {
  return (
    <div className="form-actions">
      <button type="submit" className="primary" disabled={busy}>
        {label}
      </button>
      <Link to={cancel} className="button">
        Cancel
      </Link>
    </div>
  );
}

// Label for a field the form doesn't require.
export const Optional = ({ children }: { children: ReactNode }) => (
  <span>
    {children} <span className="muted">(optional)</span>
  </span>
);

// <option>s for a { value: label } map; emptyLabel adds a first option with an empty value.
export function Options({ labels, emptyLabel }: { labels: Record<string, string>; emptyLabel?: string }) {
  return (
    <>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {Object.entries(labels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}

// A size menu's choices: adult sizes, then junior.
export const SizeOptions = () => (
  <>
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
  </>
);

export const LeadBadge = ({ status }: { status: string }) => (
  <span className={`status status-${status}`}>{LEAD_STATUSES[status]}</span>
);

export const OrderBadge = ({ status }: { status: string }) => (
  <span className={`status tone-${ORDER_TONES[status]}`}>{ORDER_STATUSES[status]}</span>
);

// An empty production status means the factory hasn't started.
export const ProductionBadge = ({ status }: { status: string | null }) =>
  status ? (
    <span className={`status tone-${status === "shipped" ? "success" : "accent"}`}>{PRODUCTION_STATUSES[status]}</span>
  ) : (
    <span className="muted small">Not started</span>
  );

export const DateTime = ({ value }: { value: string }) => <time dateTime={value}>{formatDateTime(value)}</time>;
