import type { CSSProperties, ReactNode } from "react";
import { OrderBadge, ProductionBadge } from "../../components/ui";
import { PRODUCTION_STATUSES } from "../../lib/constants";
import type { Audience } from "./guideText";

// How an order moves: the order status (set by MARGEN) on the left, the production status (set by the
// factory) on the right, and the two places they're linked. Drawn with the real badges and colours, and
// the production steps from PRODUCTION_STATUSES, so it follows any change to them.

// Grid rows: the production steps sit on even rows from STEP_ROW, with an arrow between each pair.
const STEP_ROW = 6;
const productionSteps: (string | null)[] = [null, ...Object.keys(PRODUCTION_STATUSES)];
const stepRow = (i: number) => STEP_ROW + 2 * i;
const lastRow = stepRow(productionSteps.length - 1);

const at = (row: number | string, column: number): CSSProperties => ({ gridRow: row, gridColumn: column });
const Down = ({ row, column, children }: { row: number; column: number; children?: ReactNode }) => (
  <div className="status-flow-down" style={at(row, column)} aria-hidden={children ? undefined : true}>
    <span aria-hidden="true">↓</span>
    {children && <span className="muted small">{children}</span>}
  </div>
);

export function StatusFlow({ audience }: { audience: Audience }) {
  const factory = audience === "factory";
  return (
    <figure className="status-flow">
      <div className="status-flow-grid">
        <div className="status-flow-head" style={at(1, 1)}>
          <strong>Order status</strong>
          <span className="muted small">Set by MARGEN</span>
        </div>
        <div className="status-flow-head" style={at(1, 3)}>
          <strong>Production status</strong>
          <span className="muted small">{factory ? "Set by you" : "Set by the factory"}</span>
        </div>

        <div style={at(2, 1)}>
          <OrderBadge status="received" />
        </div>
        <Down row={3} column={1} />
        <div style={at(4, 1)}>
          <OrderBadge status="accepted" />
        </div>
        <Down row={5} column={1}>MARGEN assigns {factory ? "your" : "a"} factory</Down>
        <div style={at(STEP_ROW, 1)}>
          <OrderBadge status="in_production" />
        </div>
        <div className="status-flow-link" style={at(STEP_ROW, 2)}>
          <span className="muted small">starts</span> <span aria-hidden="true">→</span>
        </div>
        <div className="status-flow-line" style={at(`${STEP_ROW + 1} / ${lastRow}`, 1)} aria-hidden="true" />
        <div style={at(lastRow, 1)}>
          <OrderBadge status="shipped" />
        </div>
        <div className="status-flow-link" style={at(lastRow, 2)}>
          <span aria-hidden="true">←</span> <span className="muted small">also sets</span>
        </div>

        {productionSteps.map((status, i) => (
          <div key={status ?? "none"} style={at(stepRow(i), 3)}>
            <ProductionBadge status={status} />
          </div>
        ))}
        {productionSteps.slice(1).map((status, i) => (
          <Down key={status} row={stepRow(i) + 1} column={3} />
        ))}

        <div className="status-flow-cancelled" style={at(lastRow + 1, 1)}>
          <OrderBadge status="cancelled" />
          <span className="muted small">at any step before Shipped</span>
        </div>
      </div>
      <figcaption className="muted small">
        MARGEN sets the order status; {factory ? "you set" : "the factory sets"} the production status. Assigning a factory moves
        the order to In production with production at Not started, and production Shipped marks the order Shipped too. Statuses move one step at a time; nobody can skip one.
      </figcaption>
    </figure>
  );
}
