import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, Dash, DateTime, Missing, OrDash, QueryGate, loadingState } from "../../components/ui";
import { invalidate, useDbAction, useDeleteRecord } from "../../data/mutations";
import { useOrderRequests, useOrganizations, type OrderRequest } from "../../data/queries";
import { SIZES } from "../../lib/constants";
import { formatDate, plural } from "../../lib/format";
import { deleteMessage, formValues } from "../../lib/forms";
import { DbError, isDuplicate, messageOf, supabase } from "../../lib/supabase";

const STATUS_LABELS: Record<string, string> = { new: "New", converted: "Turned into an order", rejected: "Rejected" };
const STATUS_TONES: Record<string, string> = { new: "tone-accent", converted: "tone-success", rejected: "tone-muted" };
const RequestBadge = ({ status }: { status: string }) => <span className={`status ${STATUS_TONES[status] ?? ""}`}>{STATUS_LABELS[status] ?? status}</span>;

const pieces = (r: OrderRequest) => r.lines.reduce((sum, l) => sum + l.quantity, 0);
const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

export function OrderRequestsPage({ id }: { id?: string }) {
  const requests = useOrderRequests();

  if (id) {
    return (
      <QueryGate queries={[requests]}>
        {() => {
          const request = requests.data!.find((r) => r.id === id);
          return request ? <OrderRequestPage request={request} /> : <Missing back="/order-requests" backLabel="Order requests" what="order request" />;
        }}
      </QueryGate>
    );
  }

  const all = requests.data ?? [];
  return (
    <ListPage
      title="Order requests"
      count={all.length}
      placeholder="Search requests"
      loading={loadingState([requests])}
      empty="No order requests yet. Clients send them from the public order form."
      actions={
        // The page clients use; share this link with them.
        <a href="#/order" target="_blank" rel="noreferrer" className="button">
          Public order form
        </a>
      }
      head={
        <>
          <th>Received</th>
          <th>Organization</th>
          <th className="hide-sm">Contact</th>
          <th className="num hide-sm">Pieces</th>
          <th>Status</th>
        </>
      }
      rows={all.map((r) => ({
        key: r.id,
        to: `/order-requests/${r.id}`,
        search: `${r.organization_name} ${r.contact_name} ${r.email} ${STATUS_LABELS[r.status] ?? ""}`.toLowerCase(),
        cells: (
          <>
            <td className="muted">{formatDate(r.created_at)}</td>
            <td>
              <Link to={`/order-requests/${r.id}`} className="strong">
                {r.organization_name}
              </Link>
            </td>
            <td className="hide-sm">{r.contact_name}</td>
            <td className="num hide-sm">{pieces(r)}</td>
            <td>
              <RequestBadge status={r.status} />
            </td>
          </>
        ),
      }))}
    />
  );
}

function OrderRequestPage({ request }: { request: OrderRequest }) {
  const remove = useDeleteRecord("order_requests");
  const label = `the order request from ${request.organization_name}`;
  const setStatus = useDbAction({
    tables: ["order_requests"],
    run: async (status: "new" | "rejected") => {
      const { error } = await supabase.from("order_requests").update({ status }).eq("id", request.id);
      if (error) throw new DbError(error);
    },
    success: (status) => (status === "rejected" ? `Rejected ${label}.` : `Reopened ${label}.`),
    failure: () => `Couldn't change ${label}`,
  });
  const lines = [...request.lines].sort(
    (a, b) => (a.item?.name ?? "").localeCompare(b.item?.name ?? "") || SIZES.indexOf(a.size) - SIZES.indexOf(b.size),
  );

  return (
    <>
      <BackLink to="/order-requests">Order requests</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{request.organization_name}</h1>
          <p className="muted">
            Received <DateTime value={request.created_at} />
          </p>
        </div>
        <RequestBadge status={request.status} />
        {request.status === "new" && (
          <button type="button" onClick={() => setStatus.mutate("rejected")} disabled={setStatus.isPending}>
            Reject
          </button>
        )}
        {request.status === "rejected" && (
          <button type="button" onClick={() => setStatus.mutate("new")} disabled={setStatus.isPending}>
            Reopen
          </button>
        )}
        <button
          type="button"
          className="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(deleteMessage(label))) remove.mutate({ id: request.id, label });
          }}
        >
          Delete
        </button>
      </div>
      <div className="detail-grid stacked">
        <section className="card section">
          <h2>Details</h2>
          <dl className="details across">
            <div>
              <dt>Contact</dt>
              <dd>{request.contact_name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${request.email}`}>{request.email}</a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <OrDash>{request.phone}</OrDash>
              </dd>
            </div>
            <div>
              <dt>Uploaded template</dt>
              <dd>
                <OrDash>{request.file_name}</OrDash>
              </dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>{request.order_id ? <Link to={`/customs/${request.order_id}`}>Open the order</Link> : <Dash />}</dd>
            </div>
          </dl>
          {request.notes && (
            <>
              <h3>Notes from the client</h3>
              <p className="notes">{request.notes}</p>
            </>
          )}
        </section>
        <section className="card section">
          <h2>
            Items <Count n={pieces(request)} />
          </h2>
          <div className="table-wrap">
            <table className="static">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.item?.name ?? "Unknown item"}</td>
                    <td>{l.size}</td>
                    <td className="num">{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{pieces(request)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        {request.status === "new" && (
          <section className="card section">
            <ConvertForm request={request} />
          </section>
        )}
      </div>
    </>
  );
}

// Creates a real order with the request's lines, then opens it.
function ConvertForm({ request }: { request: OrderRequest }) {
  const organizations = useOrganizations();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useNotice();
  const convert = useMutation({
    mutationFn: async ({ margen_order_id, organization_id }: { margen_order_id: string; organization_id?: string }) => {
      const { data, error } = await supabase.rpc("convert_order_request", { request_id: request.id, margen_order_id, organization_id });
      if (error) throw new DbError(error);
      return data;
    },
    onSuccess: async (orderId, { margen_order_id }) => {
      await Promise.all([invalidate(queryClient, "orders"), invalidate(queryClient, "order_items")]);
      notify("success", `Created order ${margen_order_id} from the request, with ${plural(request.lines.length, "line")}.`, { keep: true });
      navigate(`/customs/${orderId}`);
    },
    onError: (error) =>
      notify("error", isDuplicate(error) ? "That Margen order ID is already used by another order." : `Couldn't create the order: ${messageOf(error)}`),
  });
  const match = organizations.data?.find((o) => sameName(o.name, request.organization_name));

  return (
    <form
      className="stack convert-form"
      onSubmit={(event) => {
        const v = formValues(event);
        convert.mutate({ margen_order_id: v.margen_order_id, organization_id: v.organization_id || undefined });
      }}
    >
      <h2>Turn into an order</h2>
      <p className="muted small">
        Creates an order with these items and marks this request as done. The client wrote "{request.organization_name}"
        {match ? ", which matches an existing organization." : ". No organization has that name: choose one, or add it first on the Organizations page."}
      </p>
      <div className="field-row">
        <label>
          Margen order ID
          <input name="margen_order_id" required autoComplete="off" placeholder="e.g. 2026_1_OUTRIGGER" />
        </label>
        <label>
          Organization
          {/* Remounts once organizations load, so the matching one is chosen. */}
          <select name="organization_id" key={match?.id ?? "none"} defaultValue={match?.id ?? ""} disabled={organizations.isPending}>
            <option value="">No organization</option>
            {organizations.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={convert.isPending}>
          Create order
        </button>
      </div>
    </form>
  );
}
