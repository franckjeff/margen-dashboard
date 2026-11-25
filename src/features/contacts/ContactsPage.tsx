import { Link, useNavigate } from "react-router";
import { Dialog } from "../../components/Dialog";
import { ListPage, SortHeader } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, Dash, EmailInput, FormButtons, Missing, OrDash, Optional, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { useDeleteRecord, useDeleteRecords, useSaveRecord } from "../../data/mutations";
import { useContacts, useFactories, useNotes, useOrganizations, type Contact } from "../../data/queries";
import { addressLines, contactLocation, formatDate, fullName, place, plural } from "../../lib/format";
import { deleteManyMessage, deleteMessage, formValues, orNull } from "../../lib/forms";
import { NotesSection } from "../notes/NotesSection";
import { BillingAddress, ContactDetailsFields, DeliveryAddress, Phone } from "./ContactDetails";
import { contactDetailsRow } from "./details";
import { isBusyWith, useLinkActions, type LinkOwner } from "../organizations/links";
import { useConfirm } from "../../components/Confirm";

function ContactForm({ contact }: { contact?: Contact }) {
  const save = useSaveRecord("contacts");
  const { notify } = useNotice();
  const back = contact ? `/contacts/${contact.id}` : "/contacts";
  const text = (name: "first_name" | "last_name" | "email") => contact?.[name] ?? "";
  return (
    <>
      {contact && <PanelHead title="Edit contact" close={back} />}
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = {
            first_name: v.first_name,
            last_name: v.last_name,
            email: orNull(v.email.toLowerCase()),
            ...contactDetailsRow(v),
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
        <label>
          <Optional>Email</Optional>
          <EmailInput name="email" autoComplete="off" defaultValue={text("email")} placeholder="Where the app sends this contact's emails" />
        </label>
        <ContactDetailsFields contact={contact} />
        <FormButtons label={contact ? "Save changes" : "Add contact"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

const linkedNames =(c: Contact) => [...c.organizations, ...c.factories].map((o) => o.name).join(", ");

// Adding a contact happens in a window over the list (#/contacts/new); it opens the new one's page.
function AddContact() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add contact" onClose={() => navigate("/contacts")}>
      <ContactForm />
    </Dialog>
  );
}

export function ContactsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const ask = useConfirm();
  const contacts = useContacts();
  const notes = useNotes();
  const removeMany = useDeleteRecords("contacts", "contacts");

  // A selected contact gets its own page; adding one (#/contacts/new) opens a window over the list.
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
    <>
      {id === "new" && <AddContact />}
      <ListPage
        title="Contacts"
        count={all.length}
        newTo="/contacts/new"
        newLabel="Add"
        placeholder="Search contacts"
        empty="No contacts yet."
        loading={loadingState([contacts])}
        deletion={{
          nouns: "contacts",
          busy: removeMany.isPending,
          onDelete: async (ids, done) => {
            const picked = all.filter((c) => ids.includes(c.id));
            const links = picked.reduce((n, c) => n + c.organizations.length + c.factories.length, 0);
            const defaults = picked.flatMap((c) => [...c.organizations, ...c.factories].filter((o) => o.is_default).map((o) => o.name));
            const noteCount = (notes.data ?? []).filter((n) => n.contact_id && ids.includes(n.contact_id)).length;
            const message = deleteManyMessage(picked.map(fullName), "contacts", [
              links > 0 && `${plural(links, "link")} to organizations and factories will be removed too. They themselves are kept.`,
              defaults.length > 0 && `Default contact of ${defaults.join(", ")}, so their emails need a new default contact.`,
              noteCount > 0 && `${plural(noteCount, "note")} will be deleted too.`,
            ]);
            if (await ask(message)) removeMany.mutate(picked.map((c) => ({ id: c.id, label: fullName(c) })), { onSettled: done });
          },
        }}
        head={
          <>
            <SortHeader column="first_name">First name</SortHeader>
            <SortHeader column="last_name">Last name</SortHeader>
            <SortHeader column="email" className="hide-sm">
              Email
            </SortHeader>
            <SortHeader column="location" className="hide-sm">
              Location
            </SortHeader>
            <SortHeader column="linked">Organizations and factories</SortHeader>
          </>
        }
        rows={all.map((c) => ({
          key: c.id,
          to: `/contacts/${c.id}`,
          label: fullName(c),
          sort: { first_name: c.first_name, last_name: c.last_name, email: c.email, location: contactLocation(c), linked: linkedNames(c) },
          search: `${fullName(c)} ${c.email ?? ""} ${c.phone ?? ""} ${addressLines(c).join(" ")} ${linkedNames(c)}`.toLowerCase(),
          cells: (
            <>
              <td>
                <Link to={`/contacts/${c.id}`} className="strong">
                  {c.first_name}
                </Link>
              </td>
              <td>{c.last_name}</td>
              <td className="hide-sm">
                <OrDash>{c.email}</OrDash>
              </td>
              <td className="hide-sm">
                <OrDash>{contactLocation(c)}</OrDash>
              </td>
              <td>
                <OrDash>{linkedNames(c)}</OrDash>
              </td>
            </>
          ),
        }))}
      />
    </>
  );
}

// Full page for one contact, laid out like the organization page.
function ContactPage({ contact, editing }: { contact: Contact; editing: boolean }) {
  const ask = useConfirm();
  const remove = useDeleteRecord("contacts");
  const notes = useNotes();
  const label = fullName(contact);

  const confirmDelete = async () => {
    const links = contact.organizations.length + contact.factories.length;
    const defaults = [...contact.organizations, ...contact.factories].filter((o) => o.is_default).map((o) => o.name);
    const noteCount = (notes.data ?? []).filter((n) => n.contact_id === contact.id).length;
    const message = deleteMessage(label, [
      links > 0 && `Its ${plural(links, "link")} to organizations and factories will be removed too. They themselves are kept.`,
      defaults.length > 0 && `It's the default contact of ${defaults.join(", ")}, so their emails need a new default contact.`,
      noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`,
    ]);
    if (await ask(message)) remove.mutate({ id: contact.id, label });
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
      {/* Three full-width blocks: the contact's details, its organizations, then its factories. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <ContactForm contact={contact} />
          ) : (
            <>
              <h2>Details</h2>
              {/* Every field is shown, empty ones as a dash, so it's clear what's missing. */}
              <dl className="details across">
                <div>
                  <dt>First name</dt>
                  <dd>{contact.first_name}</dd>
                </div>
                <div>
                  <dt>Last name</dt>
                  <dd>
                    <OrDash>{contact.last_name}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <Dash />}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <Phone contact={contact} />
                  </dd>
                </div>
                <div>
                  <dt>Delivery address</dt>
                  <dd>
                    <DeliveryAddress contact={contact} />
                  </dd>
                </div>
                <div>
                  <dt>Billing address</dt>
                  <dd>
                    <BillingAddress contact={contact} />
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
          <ContactOwners contact={contact} owner="organization" editing={editing} />
        </section>
        <section className="card section">
          <ContactOwners contact={contact} owner="factory" editing={editing} />
        </section>
        <section className="card section">
          <NotesSection subject={{ contact_id: contact.id }} />
        </section>
      </div>
    </>
  );
}

// The organizations or factories this contact is linked to. The default contact gets their emails.
// Linking, unlinking and choosing the default only show in edit mode.
function ContactOwners({ contact, owner, editing }: { contact: Contact; owner: LinkOwner; editing: boolean }) {
  const organizations = useOrganizations();
  const factories = useFactories();
  const { link, makeDefault, unlink } = useLinkActions();
  const isFactory = owner === "factory";
  const linkedTo: { id: string; name: string; is_default: boolean; where: string }[] = isFactory
    ? contact.factories.map((f) => ({ ...f, where: f.country ?? "" }))
    : contact.organizations.map((o) => ({ ...o, where: place(o) }));
  const linked = new Set(linkedTo.map((o) => o.id));
  const all = (isFactory ? factories.data : organizations.data) ?? [];
  const available = all.filter((o) => !linked.has(o.id));
  const route = isFactory ? "factories" : "organizations";
  const noun = isFactory ? "factory" : "organization";

  return (
    <>
      <h2>
        {isFactory ? "Factories" : "Organizations"} <Count n={linkedTo.length} />
      </h2>
      {linkedTo.length ? (
        <div className="table-wrap">
          <table className="static">
            <tbody>
              {linkedTo.map((o) => {
                const l = { owner, owner_id: o.id, contact_id: contact.id };
                return (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/${route}/${o.id}`} className="strong">
                        {o.name}
                      </Link>
                    </td>
                    <td className="muted hide-sm">
                      <OrDash>{o.where}</OrDash>
                    </td>
                    <td>
                      {o.is_default ? (
                        <span className="badge" title={`Default contact for ${o.name}: gets its emails`}>
                          Default
                        </span>
                      ) : (
                        editing && (
                          <button type="button" className="ghost small" disabled={isBusyWith(makeDefault, l)} onClick={() => makeDefault.mutate(l)}>
                            Make default
                          </button>
                        )
                      )}
                    </td>
                    {editing && (
                      <td className="num">
                        <button type="button" className="ghost small" disabled={isBusyWith(unlink, l)} onClick={() => unlink.mutate(l)}>
                          Unlink
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Not linked to any {noun} yet.</p>
      )}
      {editing && available.length > 0 && (
        <form
          className="link-form"
          onSubmit={(event) => {
            const { target } = formValues(event);
            if (target) link.mutate({ owner, owner_id: target, contact_id: contact.id });
          }}
        >
          <select name="target" required aria-label={`${isFactory ? "Factory" : "Organization"} to link`} defaultValue="">
            <option value="">Choose {isFactory ? "a factory" : "an organization"} to link…</option>
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
      )}
      {/* The same line in both blocks; it explains why there's nothing to choose when that's the case. */}
      {editing && (
        <p className="muted small">
          {available.length === 0 && (all.length ? `Already linked to every ${noun}. ` : `No ${route} yet. `)}
          <Link to={`/${route}/new`}>Add {isFactory ? "a factory" : "an organization"}</Link>
        </p>
      )}
    </>
  );
}
