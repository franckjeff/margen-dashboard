import { Link, useNavigate } from "react-router";
import { Dialog } from "../../components/Dialog";
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
import { isOpenOrder } from "../../lib/constants";
import { formatDate, fullName, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { LinkedContacts } from "../contacts/LinkedContacts";
import { NotesSection } from "../notes/NotesSection";

function FactoryForm({ factory }: { factory?: Factory }) {
  const save = useSaveRecord("factories");
  const { notify } = useNotice();
  const back = factory ? `/factories/${factory.id}` : "/factories";
  return (
    <>
      {factory && <PanelHead title="Edit factory" close={back} />}
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = { name: v.name, country: orNull(v.country), description: orNull(v.description) };
          if (!row.name) return notify("error", "The factory needs a name.");
          save.mutate({ row, id: factory?.id, label: row.name });
        }}
      >
        <label>
          Name
          <input name="name" required autoFocus autoComplete="off" defaultValue={factory?.name} />
        </label>
        <label>
          <Optional>Country</Optional>
          <input name="country" autoComplete="off" defaultValue={factory?.country ?? ""} />
        </label>
        <label>
          <Optional>Description</Optional>
          <textarea name="description" rows={3} defaultValue={factory?.description ?? ""} placeholder="What they make, how they work…" />
        </label>
        <FormButtons label={factory ? "Save changes" : "Add factory"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Adding a factory happens in a window over the list (#/factories/new); it opens the new one's page.
function AddFactory() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add factory" onClose={() => navigate("/factories")}>
      <FactoryForm />
    </Dialog>
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
    <>
      {id === "new" && <AddFactory />}
      <ListPage
        title="Factories"
        count={all.length}
        newTo="/factories/new"
        newLabel="Add"
        placeholder="Search factories"
        loading={loadingState([factories, orders])}
        head={
          <>
            <th>Name</th>
            <th className="hide-sm">Default contact</th>
            <th className="hide-sm">Country</th>
            <th className="num">Open orders</th>
            <th className="num hide-sm">All orders</th>
          </>
        }
        rows={all.map((f) => {
          const own = allOrders.filter((o) => o.factory_id === f.id);
          const open = own.filter(isOpenOrder).length;
          const def = f.contacts.find((c) => c.is_default);
          return {
            key: f.id,
            to: `/factories/${f.id}`,
            search: `${f.name} ${f.contacts.map(fullName).join(" ")} ${f.country ?? ""} ${f.description ?? ""}`.toLowerCase(),
            cells: (
              <>
                <td>
                  <Link to={`/factories/${f.id}`} className="strong">
                    {f.name}
                  </Link>
                </td>
                <td className="hide-sm">{def ? fullName(def) : <Dash />}</td>
                <td className="hide-sm">
                  <OrDash>{f.country}</OrDash>
                </td>
                <td className="num">{open || <Dash />}</td>
                <td className="num hide-sm">{own.length || <Dash />}</td>
              </>
            ),
          };
        })}
      />
    </>
  );
}

function FactoryPage({ factory, editing }: { factory: Factory; editing: boolean }) {
  const remove = useDeleteRecord("factories");
  const orders = useOrders();
  const notes = useNotes();
  const { notify } = useNotice();
  const defaultContact = factory.contacts.find((c) => c.is_default);

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
      {/* Full-width blocks, one under the other: details, contacts, orders, notes. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <FactoryForm factory={factory} />
          ) : (
            <>
              <h2>Details</h2>
              {/* Every field is shown, empty ones as a dash, so it's clear what's missing. */}
              <dl className="details across">
                <div>
                  <dt>Name</dt>
                  <dd>{factory.name}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    <OrDash>{factory.country}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Default contact</dt>
                  <dd>{defaultContact ? <Link to={`/contacts/${defaultContact.id}`}>{fullName(defaultContact)}</Link> : <Dash />}</dd>
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
          <LinkedContacts owner="factory" ownerId={factory.id} contacts={factory.contacts} who={factory.name} editing={editing} />
        </section>
        <section className="card section">
          <FactoryOrders factory={factory} />
        </section>
        <section className="card section">
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
          <p className="empty">No orders yet.</p>
        ))}
    </>
  );
}
