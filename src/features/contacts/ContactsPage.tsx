import { Link } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, FormButtons, Missing, OrDash, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useContacts, useNotes, useOrganizations, type Contact } from "../../data/queries";
import { ADDRESS_FIELDS } from "../../lib/constants";
import { addressLines, contactLocation, formatDate, fullName, place, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { NotesSection } from "../notes/NotesSection";
import { isBusyWith, useLinkActions } from "../organizations/links";

function ContactForm({ contact }: { contact?: Contact }) {
  const save = useSaveRecord("contacts");
  const { notify } = useNotice();
  const back = contact ? `/contacts/${contact.id}` : "/contacts";
  const text = (name: (typeof ADDRESS_FIELDS)[number] | "first_name" | "last_name") => contact?.[name] ?? "";
  return (
    <>
      <PanelHead title={contact ? "Edit contact" : "New contact"} close={back} />
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = {
            first_name: v.first_name,
            last_name: v.last_name,
            ...Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, orNull(v[f])])),
          };
          if (!row.first_name || !row.last_name) return notify("error", "The contact needs a first and last name.");
          save.mutate({ row, id: contact?.id, label: fullName(row) });
        }}
      >
        <label>
          First name
          <input name="first_name" required autoFocus autoComplete="off" defaultValue={text("first_name")} />
        </label>
        <label>
          Last name
          <input name="last_name" required autoComplete="off" defaultValue={text("last_name")} />
        </label>
        <fieldset className="stack">
          <legend>
            Address <span className="muted">(optional)</span>
          </legend>
          <label>
            Address line 1
            <input name="address_line1" autoComplete="off" defaultValue={text("address_line1")} placeholder="Street and number" />
          </label>
          <label>
            Address line 2
            <input name="address_line2" autoComplete="off" defaultValue={text("address_line2")} placeholder="Apartment, suite, building…" />
          </label>
          <div className="field-row">
            <label>
              City
              <input name="city" autoComplete="off" defaultValue={text("city")} />
            </label>
            <label>
              Postal code
              <input name="postal_code" autoComplete="off" defaultValue={text("postal_code")} />
            </label>
          </div>
          <div className="field-row">
            <label>
              State / region
              <input name="state" autoComplete="off" defaultValue={text("state")} />
            </label>
            <label>
              Country
              <input name="country" autoComplete="off" defaultValue={text("country")} />
            </label>
          </div>
        </fieldset>
        <FormButtons label={contact ? "Save changes" : "Create contact"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

export function ContactsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const contacts = useContacts();

  // A selected contact gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    return (
      <QueryGate queries={[contacts]}>
        {() => {
          const contact = contacts.data!.find((c) => c.id === id);
          return contact ? <ContactPage contact={contact} editing={editing} /> : <Missing back="/contacts" backLabel="Contacts" what="contact" />;
        }}
      </QueryGate>
    );
  }

  const all = contacts.data ?? [];
  return (
    <ListPage
      title="Contacts"
      count={all.length}
      newTo="/contacts/new"
      newLabel="New contact"
      placeholder="Search contacts"
      loading={loadingState([contacts])}
      head={
        <>
          <th>First name</th>
          <th>Last name</th>
          <th className="hide-sm">Location</th>
          <th>Organizations</th>
        </>
      }
      rows={all.map((c) => ({
        key: c.id,
        to: `/contacts/${c.id}`,
        search: `${fullName(c)} ${addressLines(c).join(" ")} ${c.organizations.map((o) => o.name).join(" ")}`.toLowerCase(),
        cells: (
          <>
            <td>
              <Link to={`/contacts/${c.id}`} className="strong">
                {c.first_name}
              </Link>
            </td>
            <td>{c.last_name}</td>
            <td className="hide-sm">
              <OrDash>{contactLocation(c)}</OrDash>
            </td>
            <td>
              <OrDash>{c.organizations.map((o) => o.name).join(", ")}</OrDash>
            </td>
          </>
        ),
      }))}
      panel={id === "new" ? <ContactForm /> : undefined}
    />
  );
}

// Full page for one contact, laid out like the organization page.
function ContactPage({ contact, editing }: { contact: Contact; editing: boolean }) {
  const remove = useDeleteRecord("contacts");
  const notes = useNotes();
  const lines = addressLines(contact);
  const label = fullName(contact);

  const confirmDelete = () => {
    const links = contact.organizations.length;
    const noteCount = (notes.data ?? []).filter((n) => n.contact_id === contact.id).length;
    const message = deleteMessage(label, [
      links > 0 && `Its ${plural(links, "organization link")} will be removed too. The organizations themselves are kept.`,
      noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`,
    ]);
    if (confirm(message)) remove.mutate({ id: contact.id, label });
  };

  return (
    <>
      <BackLink to="/contacts">Contacts</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{label}</h1>
          <p className="muted">{contactLocation(contact) || "No location yet"}</p>
        </div>
        {!editing && (
          <>
            <Link to={`/contacts/${contact.id}/edit`} className="button">
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
            <ContactForm contact={contact} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
                <div>
                  <dt>Address</dt>
                  <dd>
                    {lines.length ? (
                      <address className="address">
                        {lines.map((line, i) => (
                          <span key={i}>
                            {i > 0 && <br />}
                            {line}
                          </span>
                        ))}
                      </address>
                    ) : (
                      <>
                        <span className="muted">No address yet.</span> <Link to={`/contacts/${contact.id}/edit`}>Add one</Link>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(contact.created_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <ContactOrganizations contact={contact} />
        </section>
        <section className="card section span-all">
          <NotesSection subject={{ contact_id: contact.id }} />
        </section>
      </div>
    </>
  );
}

function ContactOrganizations({ contact }: { contact: Contact }) {
  const organizations = useOrganizations();
  const { link, makeDefault, unlink } = useLinkActions();
  const linked = new Set(contact.organizations.map((o) => o.id));
  const available = (organizations.data ?? []).filter((o) => !linked.has(o.id));

  return (
    <>
      <h2>
        Organizations <Count n={contact.organizations.length} />
      </h2>
      {contact.organizations.length ? (
        <div className="table-wrap">
          <table className="static">
            <tbody>
              {contact.organizations.map((o) => {
                const l = { organization_id: o.id, contact_id: contact.id };
                return (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/organizations/${o.id}`} className="strong">
                        {o.name}
                      </Link>
                    </td>
                    <td className="muted hide-sm">
                      <OrDash>{place(o)}</OrDash>
                    </td>
                    <td>
                      {o.is_default ? (
                        <span className="badge" title={`Default contact for ${o.name}`}>
                          Default
                        </span>
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
        <p className="empty">Not linked to any organization yet.</p>
      )}
      {available.length ? (
        <form
          className="link-form"
          onSubmit={(event) => {
            const { organization } = formValues(event);
            if (organization) link.mutate({ organization_id: organization, contact_id: contact.id });
          }}
        >
          <select name="organization" required aria-label="Organization to link" defaultValue="">
            <option value="">Choose an organization to link…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={link.isPending}>
            Link
          </button>
        </form>
      ) : (
        <p className="muted small">
          {organizations.data?.length ? "Already linked to every organization." : "No organizations yet."}{" "}
          <Link to="/organizations/new">Add an organization</Link>
        </p>
      )}
    </>
  );
}
