import { Link } from "react-router";
import { loadingState, OrderBadge } from "../../components/ui";
import { useDashboardCounts } from "../../data/queries";
import { FLOW_STATUSES, SIDE_STATUSES } from "./statusCounts";

// The admin Dashboard's order flow: Received › Accepted › In production › Done, each with the number
// of orders in that status now, in the status colors. On hold and Cancelled sit beside the flow.
export function OrderFlow() {
  // Counted by the database, leaving out archived orders.
  const counts = useDashboardCounts();
  const waiting = loadingState([counts]);

  const step = (status: string) => (
    <Link to="/customs" className="flow-step" key={status}>
      <OrderBadge status={status} />
      <span className="flow-count" data-testid={`flow-count-${status}`}>
        ({counts.data?.order_statuses[status] ?? 0})
      </span>
    </Link>
  );

  return (
    <section className="card section order-flow" aria-label="Orders by status">
      <div className="section-title">
        <h2>Orders by status</h2>
        <span className="muted small">Archived orders aren't counted.</span>
      </div>
      {waiting ?? (
        <div className="flow-row">
          <div className="flow">{FLOW_STATUSES.map(step)}</div>
          <div className="flow flow-side">{SIDE_STATUSES.map(step)}</div>
        </div>
      )}
    </section>
  );
}
