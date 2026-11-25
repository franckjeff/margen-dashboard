import { Link, useNavigate } from "react-router";
import { Dialog } from "../../components/Dialog";
import { ListPage, SortHeader } from "../../components/ListPage";
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
import { deleteRow, useDbAction, useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useNotes, useOrders, useOrganizations, useUsers, type Order, type Organization, type User } from "../../data/queries";
import { formatDate, fullName, place, plural } from "../../lib/format";
import { deleteManyMessage, deleteMessage, formValues, orNull } from "../../lib/forms";
import { useUiState } from "../../lib/uiState";
import { NotesSection } from "../notes/NotesSection";
import { LinkedContacts } from "../contacts/LinkedContacts";
import { useConfirm } from "../../components/Confirm";

function OrganizationForm({ org }: { org?: Organization }) {
  const save = useSaveRecord("organizations");
  const { notify } = useNotice();
  const back = org ? `/organizations/${org.id}` : "/organizations";
  return (
    <>
      {org && <PanelHead title="Edit organization" close={back} />}
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = { name: v.name, state: orNull(v.state), country: orNull(v.country) };
          if (!row.name) return notify("error", "The organization needs a name.");
          save.mutate({ row, id: org?.id, label: row.name });
        }}
      >
        <label>
          Name
          <input name="name" required autoFocus defaultValue={org?.name} placeholder="e.g. Outrigger Canoe Club" />
        </label>
        <label>
          <Optional>State</Optional>
          <input name="state" defaultValue={org?.state ?? ""} placeholder="e.g. Hawaii" />
        </label>
        <label>
          <Optional>Country</Optional>
          <input name="country" defaultValue={org?.country ?? ""} placeholder="e.g. United States" />
        </label>
        <FormButtons label={org ? "Save changes" : "Add organization"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Adding an organization happens in a window over the list (#/organizations/new); it opens the new one's page.
function AddOrganization() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add organization" onClose={() => navigate("/organizations")}>
      <OrganizationForm />
    </Dialog>
  );
}

// Why an organization can't be deleted, or null when it can. The database checks the same (organizations_check_delete):
// no orders that are neither cancelled nor archived, and no client accounts linked to it.
function deleteBlocker(org: Organization, orders: Order[], users: User[]) {
  const open = orders.filter((o) => o.organization_id === org.id && !o.archived_at && o.order_status !== "cancelled").length;
  if (open) return `${org.name} has ${plural(open, "order")} that ${open === 1 ? "isn't" : "aren't"} cancelled or archived, so it can't be deleted.`;
  const accounts = users.filter((u) => u.organization_id === org.id).length;
  if (accounts) return `${org.name} has ${plural(accounts, "client account")} linked to it. Link ${accounts === 1 ? "it" : "them"} to another organization, or delete ${accounts === 1 ? "it" : "them"}, first.`;
  return null;
}

// What else goes, or stays, when the organizations are deleted; for the confirmation.
function deleteConsequences(orgs: Organization[], orders: Order[], noteCount: number) {
  const ids = new Set(orgs.map((o) => o.id));
  const links = orgs.reduce((n, o) => n + o.contacts.length, 0);
  const kept = orders.filter((o) => o.organization_id && ids.has(o.organization_id)).length;
  return [
    links > 0 && `${plural(links, "contact link")} will be removed. The contacts themselves are kept.`,
    noteCount > 0 && `${plural(noteCount, "note")} will be deleted.`,
    kept > 0 && `${plural(kept, "cancelled or archived order")} ${kept === 1 ? "is" : "are"} kept, with the organization's name, so ${kept === 1 ? "it" : "they"} can still be found.`,
  ];
}

// Deletes each one in turn, carrying on past a failure, then reports every one that failed.
async function deleteOrganizations(orgs: Organization[]) {
  const failed: string[] = [];
  for (const org of orgs) {
    await deleteRow("organizations", org.id, org.name).catch((error: unknown) => failed.push(error instanceof Error ? error.message : String(error)));
  }
  if (failed.length) throw new Error(failed.join(" "));
}

const distinct = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

export function OrganizationsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const ask = useConfirm();
  const organizations = useOrganizations();
  const orders = useOrders();
  const users = useUsers();
  const notes = useNotes();
  const remove = useDbAction({
    tables: ["organizations"],
    run: deleteOrganizations,
    success: (orgs) => `Deleted ${orgs.length === 1 ? orgs[0].name : `${orgs.length} organizations`}.`,
    failure: () => "Some organizations weren't deleted",
  });
  // Country and State filters; "" means all. States only list those in the chosen country.
  const [filters, setFilters] = useUiState("orgFilters", { country: "", state: "" });

  // A selected organization gets its own page; adding one (#/organizations/new) opens a window over the list.
  if (id && id !== "new") {
    return (
      <QueryGate queries={[organizations]}>
        {() => {
          const org = organizations.data!.find((o) => o.id === id);
          return org ? (
            <OrganizationPage org={org} editing={editing} />
          ) : (
            <Missing back="/organizations" backLabel="Organizations" what="organization" />
          );
        }}
      </QueryGate>
    );
  }

  const all = organizations.data ?? [];
  const matchesFilters = (o: Organization) =>
    (!filters.country || o.country === filters.country) && (!filters.state || o.state === filters.state);
  // Until orders and users have loaded, nothing can be ticked: whether each can be deleted isn't known yet.
  const known = Boolean(orders.data && users.data);
  const blocker = (o: Organization) => (known ? deleteBlocker(o, orders.data!, users.data!) : "Loading…");
  const confirmDelete = async (ids: string[], done: () => void) => {
    const selected = all.filter((o) => ids.includes(o.id));
    const noteCount = (notes.data ?? []).filter((n) => n.organization_id && ids.includes(n.organization_id)).length;
    const message = deleteManyMessage(
      selected.map((o) => o.name),
      "organizations",
      deleteConsequences(selected, orders.data ?? [], noteCount),
    );
    if (await ask(message)) remove.mutate(selected, { onSettled: done });
  };

  const countries = distinct(all.map((o) => o.country));
  const states = distinct(all.filter((o) => !filters.country || o.country === filters.country).map((o) => o.state));

  const setCountry = (country: string) =>
    // A state that isn't in the newly chosen country no longer applies.
    setFilters((f) => ({
      country,
      state: f.state && all.some((o) => o.state === f.state && (!country || o.country === country)) ? f.state : "",
    }));

  return (
    <>
      {id === "new" && <AddOrganization />}
      <ListPage
        title="Organizations"
        count={all.length}
        newTo="/organizations/new"
        newLabel="Add"
        deletion={{ nouns: "organizations", busy: remove.isPending, onDelete: confirmDelete }}
        placeholder="Search organizations"
        empty="No organizations yet."
        loading={loadingState([organizations])}
        filters={
          <>
            <select className="filter" aria-label="Filter by country" value={filters.country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              className="filter"
              aria-label="Filter by state"
              value={filters.state}
              onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </>
        }
        head={
          <>
            <SortHeader column="name">Name</SortHeader>
            <SortHeader column="state">State</SortHeader>
            <SortHeader column="country">Country</SortHeader>
            <SortHeader column="contact" className="hide-sm">
              Default contact
            </SortHeader>
            <SortHeader column="contacts" className="num" firstDescending>
              Contacts
            </SortHeader>
          </>
        }
        rows={all.map((o) => {
          const def = o.contacts.find((c) => c.is_default);
          return {
            key: o.id,
            to: `/organizations/${o.id}`,
            label: o.name,
            search: `${o.name} ${place(o)}`.toLowerCase(),
            filteredOut: !matchesFilters(o),
            sort: { name: o.name, state: o.state, country: o.country, contact: def ? fullName(def) : null, contacts: o.contacts.length },
            blocker: blocker(o),
            cells: (
              <>
                <td>
                  <Link to={`/organizations/${o.id}`} className="strong">
                    {o.name}
                  </Link>
                </td>
                <td>
                  <OrDash>{o.state}</OrDash>
                </td>
                <td>
                  <OrDash>{o.country}</OrDash>
                </td>
                <td className="hide-sm">{def ? fullName(def) : <Dash />}</td>
                <td className="num">{o.contacts.length}</td>
              </>
            ),
          };
        })}
      />
    </>
  );
}

// Full page for one organization. Each section is its own card, so more can be added later.
function OrganizationPage({ org, editing }: { org: Organization; editing: boolean }) {
  const ask = useConfirm();
  const remove = useDeleteRecord("organizations");
  const notes = useNotes();
  const orders = useOrders();
  const users = useUsers();
  const defaultContact = org.contacts.find((c) => c.is_default);
  const blocker = orders.data && users.data ? deleteBlocker(org, orders.data, users.data) : "Loading…";

  const confirmDelete = async () => {
    const noteCount = (notes.data ?? []).filter((note) => note.organization_id === org.id).length;
    if (await ask(deleteMessage(org.name, deleteConsequences([org], orders.data ?? [], noteCount)))) remove.mutate({ id: org.id, label: org.name });
  };

  return (
    <>
      <BackLink to="/organizations">Organizations</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{org.name}</h1>
          <p className="muted">{place(org) || "No location yet"}</p>
        </div>
        {!editing && (
          <>
            <Link to={`/organizations/${org.id}/edit`} className="button">
              Edit
            </Link>
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending || Boolean(blocker)} title={blocker ?? undefined}>
              Delete
            </button>
          </>
        )}
      </div>
      {/* Full-width blocks, one under the other: details, contacts, orders, notes. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <OrganizationForm org={org} />
          ) : (
            <>
              <h2>Details</h2>
              {/* Every field is shown, empty ones as a dash, so it's clear what's missing. */}
              <dl className="details across">
                <div>
                  <dt>Name</dt>
                  <dd>{org.name}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>
                    <OrDash>{org.state}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    <OrDash>{org.country}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Default contact</dt>
                  <dd>
                    {defaultContact ? <Link to={`/contacts/${defaultContact.id}`}>{fullName(defaultContact)}</Link> : <Dash />}
                  </dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(org.created_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <LinkedContacts owner="organization" ownerId={org.id} contacts={org.contacts} who={org.name} editing={editing} />
        </section>
        <section className="card section">
          <OrganizationOrders org={org} />
        </section>
        <section className="card section">
          <NotesSection subject={{ organization_id: org.id }} />
        </section>
      </div>
    </>
  );
}

function OrganizationOrders({ org }: { org: Organization }) {
  const orders = useOrders();
  const own = (orders.data ?? []).filter((o) => o.organization_id === org.id);
  return (
    <>
      <h2>
        Orders <Count n={own.length} />
      </h2>
      {own.length ? (
        <div className="table-wrap">
          <table className="static">
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
                  <td className="muted num hide-sm">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">{orders.isPending ? "Loading…" : "No orders yet."}</p>
      )}
    </>
  );
}
