import { Link } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import {
  BackLink,
  Count,
  Dash,
  FormButtons,
  Missing,
  OrDash,
  OrderBadge,
  Optional,
  PanelHead,
  ProductionBadge,
  QueryGate,
  loadingState,
} from "../../components/ui";
import { useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useFactories, useNotes, useOrders, type Factory } from "../../data/queries";
import { OPEN_ORDER_STATUSES } from "../../lib/constants";
import { formatDate, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { NotesSection } from "../notes/NotesSection";

function FactoryForm({ factory }: { factory?: Factory }) {
  const save = useSaveRecord("factories");
  const { notify } = useNotice();
  const back = factory ? `/factories/${factory.id}` : "/factories";
  return (
    <>
      <PanelHead title={factory ? "Edit factory" : "New factory"} close={back} />
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = { name: v.name, contact_name: v.contact_name, country: orNull(v.country), description: orNull(v.description) };
          if (!row.name) return notify("error", "The factory needs a name.");
          if (!row.contact_name) return notify("error", "The factory needs a contact name.");
          save.mutate({ row, id: factory?.id, label: row.name });
        }}
      >
        <label>
          Name
          <input name="name" required autoFocus autoComplete="off" defaultValue={factory?.name} />
        </label>
        <label>
          Contact name
          <input name="contact_name" required autoComplete="off" defaultValue={factory?.contact_name} placeholder="Main contact at the factory" />
        </label>
        <label>
          <Optional>Country</Optional>
          <input name="country" autoComplete="off" defaultValue={factory?.country ?? ""} />
        </label>
        <label>
          <Optional>Description</Optional>
          <textarea name="description" rows={3} defaultValue={factory?.description ?? ""} placeholder="What they make, how they work…" />
        </label>
        <FormButtons label={factory ? "Save changes" : "Create factory"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

export function FactoriesPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const factories = useFactories();
  const orders = useOrders();

  if (id && id !== "new") {
    return (
      <QueryGate queries={[factories]}>
        {() => {
          const factory = factories.data!.find((f) => f.id === id);
          return factory ? (
            <FactoryPage factory={factory} editing={editing} />
          ) : (
            <Missing back="/factories" backLabel="Factories" what="factory" />
          );
        }}
      </QueryGate>
    );
  }

  const all = factories.data ?? [];
  const allOrders = orders.data ?? [];
  return (
    <ListPage
      title="Factories"
      count={all.length}
      newTo="/factories/new"
      newLabel="New factory"
      placeholder="Search factories"
      loading={loadingState([factories, orders])}
      head={
        <>
          <th>Name</th>
          <th className="hide-sm">Contact name</th>
          <th className="hide-sm">Country</th>
          <th className="num">Open orders</th>
          <th className="num hide-sm">All orders</th>
        </>
      }
      rows={all.map((f) => {
        const own = allOrders.filter((o) => o.factory_id === f.id);
        const open = own.filter((o) => OPEN_ORDER_STATUSES.includes(o.order_status)).length;
        return {
          key: f.id,
          to: `/factories/${f.id}`,
          search: `${f.name} ${f.contact_name} ${f.country ?? ""} ${f.description ?? ""}`.toLowerCase(),
          cells: (
            <>
              <td>
                <Link to={`/factories/${f.id}`} className="strong">
                  {f.name}
                </Link>
              </td>
              <td className="hide-sm">{f.contact_name}</td>
              <td className="hide-sm">
                <OrDash>{f.country}</OrDash>
              </td>
              <td className="num">{open || <Dash />}</td>
              <td className="num hide-sm">{own.length || <Dash />}</td>
            </>
          ),
        };
      })}
      panel={id === "new" ? <FactoryForm /> : undefined}
    />
  );
}

function FactoryPage({ factory, editing }: { factory: Factory; editing: boolean }) {
  const remove = useDeleteRecord("factories");
  const orders = useOrders();
  const notes = useNotes();
  const { notify } = useNotice();

  const confirmDelete = () => {
    // The database refuses to delete a factory that orders are assigned to; say so before asking.
    const assigned = (orders.data ?? []).filter((o) => o.factory_id === factory.id).length;
    if (assigned) {
      return notify("error", `${factory.name} has ${plural(assigned, "order")}, so it can't be deleted. Assign those orders elsewhere first.`);
    }
    const noteCount = (notes.data ?? []).filter((n) => n.factory_id === factory.id).length;
    const message = deleteMessage(factory.name, [noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`]);
    if (confirm(message)) remove.mutate({ id: factory.id, label: factory.name });
  };

  return (
    <>
      <BackLink to="/factories">Factories</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{factory.name}</h1>
          {factory.country && <p className="muted">{factory.country}</p>}
        </div>
        {!editing && (
          <>
            <Link to={`/factories/${factory.id}/edit`} className="button">
              Edit
            </Link>
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending || orders.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="detail-grid">
        <section className="card section">
          {editing ? (
            <FactoryForm factory={factory} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
                <div>
                  <dt>Name</dt>
                  <dd>{factory.name}</dd>
                </div>
                <div>
                  <dt>Contact name</dt>
                  <dd>{factory.contact_name}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    <OrDash>{factory.country}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{factory.description ? <p className="notes">{factory.description}</p> : <Dash />}</dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(factory.created_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <FactoryOrders factory={factory} />
        </section>
        <section className="card section span-all">
          <NotesSection subject={{ factory_id: factory.id }} />
        </section>
      </div>
    </>
  );
}

// The orders assigned to this factory, newest first.
function FactoryOrders({ factory }: { factory: Factory }) {
  const orders = useOrders();
  const waiting = loadingState([orders]);
  const own = (orders.data ?? []).filter((o) => o.factory_id === factory.id);

  return (
    <>
      <h2>
        Orders <Count n={own.length} />
      </h2>
      {waiting ??
        (own.length ? (
          <div className="table-wrap">
            <table className="static">
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="hide-sm">Factory order ID</th>
                  <th>Order status</th>
                  <th>Production</th>
                </tr>
              </thead>
              <tbody>
                {own.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/customs/${o.id}`} className="strong mono">
                        {o.margen_order_id}
                      </Link>
                    </td>
                    <td className="mono hide-sm">
                      <OrDash>{o.factory_order_id}</OrDash>
                    </td>
                    <td>
                      <OrderBadge status={o.order_status} />
                    </td>
                    <td>
                      <ProductionBadge status={o.production_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No orders assigned yet.</p>
        ))}
    </>
  );
}
