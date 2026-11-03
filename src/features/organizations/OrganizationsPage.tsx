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
import { useContacts, useNotes, useOrders, useOrganizations, type Organization } from "../../data/queries";
import { contactLocation, formatDate, fullName, place, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { useUiState } from "../../lib/uiState";
import { NotesSection } from "../notes/NotesSection";
import { isBusyWith, useLinkActions } from "./links";

function OrganizationForm({ org }: { org?: Organization }) {
  const save = useSaveRecord("organizations");
  const { notify } = useNotice();
  const back = org ? `/organizations/${org.id}` : "/organizations";
  return (
    <>
      <PanelHead title={org ? "Edit organization" : "New organization"} close={back} />
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
        <FormButtons label={org ? "Save changes" : "Create organization"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

const distinct = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

export function OrganizationsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const organizations = useOrganizations();
  // Country and State filters; "" means all. States only list those in the chosen country.
  const [filters, setFilters] = useUiState("orgFilters", { country: "", state: "" });

  // A selected organization gets its own page; only the "new" form stays in the list's side panel.
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
  const countries = distinct(all.map((o) => o.country));
  const states = distinct(all.filter((o) => !filters.country || o.country === filters.country).map((o) => o.state));
  const matchesFilters = (o: Organization) =>
    (!filters.country || o.country === filters.country) && (!filters.state || o.state === filters.state);

  const setCountry = (country: string) =>
    // A state that isn't in the newly chosen country no longer applies.
    setFilters((f) => ({
      country,
      state: f.state && all.some((o) => o.state === f.state && (!country || o.country === country)) ? f.state : "",
    }));

  return (
    <ListPage
      title="Organizations"
      count={all.length}
      newTo="/organizations/new"
      newLabel="New organization"
      placeholder="Search organizations"
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
          <th>Name</th>
          <th>State</th>
          <th>Country</th>
          <th className="hide-sm">Default contact</th>
          <th className="num">Contacts</th>
        </>
      }
      rows={all.map((o) => {
        const def = o.contacts.find((c) => c.is_default);
        return {
          key: o.id,
          to: `/organizations/${o.id}`,
          search: `${o.name} ${place(o)}`.toLowerCase(),
          filteredOut: !matchesFilters(o),
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
      panel={id === "new" ? <OrganizationForm /> : undefined}
    />
  );
}

// Full page for one organization. Each section is its own card, so more can be added later.
function OrganizationPage({ org, editing }: { org: Organization; editing: boolean }) {
  const remove = useDeleteRecord("organizations");
  const notes = useNotes();
  const defaultContact = org.contacts.find((c) => c.is_default);

  const confirmDelete = () => {
    // Organizations and contacts are linked to each other; deleting one removes its links.
    const n = org.contacts.length;
    const links = n > 0 && `Its ${plural(n, "contact link")} will be removed too. The contacts themselves are kept.`;
    const noteCount = (notes.data ?? []).filter((note) => note.organization_id === org.id).length;
    const noteLine = noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`;
    if (confirm(deleteMessage(org.name, [links, noteLine]))) remove.mutate({ id: org.id, label: org.name });
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
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="detail-grid">
        <section className="card section">
          {editing ? (
            <OrganizationForm org={org} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
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
          <OrganizationContacts org={org} />
        </section>
        <section className="card section span-all">
          <OrganizationOrders org={org} />
        </section>
        <section className="card section span-all">
          <NotesSection subject={{ organization_id: org.id }} />
        </section>
      </div>
    </>
  );
}

function OrganizationContacts({ org }: { org: Organization }) {
  const contacts = useContacts();
  const { link, makeDefault, unlink } = useLinkActions();
  const linked = new Set(org.contacts.map((c) => c.id));
  const available = (contacts.data ?? []).filter((c) => !linked.has(c.id));

  return (
    <>
      <h2>
        Contacts <Count n={org.contacts.length} />
      </h2>
      {org.contacts.length ? (
        <div className="table-wrap">
          <table className="static">
            <tbody>
              {org.contacts.map((c) => {
                const l = { organization_id: org.id, contact_id: c.id };
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/contacts/${c.id}`} className="strong">
                        {fullName(c)}
                      </Link>
                    </td>
                    <td className="muted hide-sm">
                      <OrDash>{contactLocation(c)}</OrDash>
                    </td>
                    <td>
                      {c.is_default ? (
                        <span className="badge">Default</span>
                      ) : (
                        <button type="button" className="ghost small" disabled={isBusyWith(makeDefault, l)} onClick={() => makeDefault.mutate(l)}>
                          Make default
                        </button>
                      )}
                    </td>
                    <td className="num">
                      <button type="button" className="ghost small" disabled={isBusyWith(unlink, l)} onClick={() => unlink.mutate(l)}>
                        Unlink
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No contacts linked yet.</p>
      )}
      {org.contacts.length > 0 && !org.contacts.some((c) => c.is_default) && (
        <p className="muted small">
          No default contact. Choose one with <strong>Make default</strong>.
        </p>
      )}
      {available.length ? (
        <form
          className="link-form"
          onSubmit={(event) => {
            const { contact } = formValues(event);
            if (contact) link.mutate({ organization_id: org.id, contact_id: contact });
          }}
        >
          <select name="contact" required aria-label="Contact to link" defaultValue="">
            <option value="">Choose a contact to link…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={link.isPending}>
            Link
          </button>
        </form>
      ) : (
        <p className="muted small">
          {contacts.data?.length ? "Every contact is already linked." : "No contacts yet."} <Link to="/contacts/new">Add a contact</Link>
        </p>
      )}
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
        <p className="empty">
          {orders.isPending ? (
            "Loading…"
          ) : (
            <>
              No orders yet. <Link to="/customs/new">Add one in Orders</Link> and choose this organization.
            </>
          )}
        </p>
      )}
    </>
  );
}
