import { Link } from "react-router";
import { Count, OrDash } from "../../components/ui";
import { useContacts, type LinkedContact } from "../../data/queries";
import { fullName } from "../../lib/format";
import { formValues } from "../../lib/forms";
import { isBusyWith, useLinkActions, type LinkOwner } from "../organizations/links";
import { Phone } from "./ContactDetails";

// Says who gets an organization's or factory's emails, or why nobody does.
export function EmailRecipientNote({ contacts, who }: { contacts: LinkedContact[]; who: string }) {
  const def = contacts.find((c) => c.is_default);
  if (!def) {
    return (
      <p className="muted small">
        No default contact, so {who} gets no emails.{contacts.length > 0 && <> Choose one with <strong>Make default</strong>.</>}
      </p>
    );
  }
  if (!def.email) {
    return <p className="muted small">{fullName(def)} is the default contact but has no email address, so {who} gets no emails.</p>;
  }
  return (
    <p className="muted small">
      Emails for {who} go to {fullName(def)} ({def.email}).
    </p>
  );
}

// Admins: the contacts linked to an organization or factory, with its default contact. Linking, unlinking
// and choosing the default only show in edit mode.
export function LinkedContacts({
  owner,
  ownerId,
  contacts,
  who,
  editing,
}: {
  owner: LinkOwner;
  ownerId: string;
  contacts: LinkedContact[];
  who: string;
  editing: boolean;
}) {
  const all = useContacts();
  const { link, makeDefault, unlink } = useLinkActions();
  const linked = new Set(contacts.map((c) => c.id));
  const available = (all.data ?? []).filter((c) => !linked.has(c.id));

  return (
    <>
      <h2>
        Contacts <Count n={contacts.length} />
      </h2>
      {contacts.length ? (
        <div className="table-wrap">
          <table className="static">
            <tbody>
              {contacts.map((c) => {
                const l = { owner, owner_id: ownerId, contact_id: c.id };
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/contacts/${c.id}`} className="strong">
                        {fullName(c)}
                      </Link>
                    </td>
                    <td className="muted hide-sm">
                      <OrDash>{c.email}</OrDash>
                    </td>
                    <td className="hide-sm">
                      <Phone contact={c} />
                    </td>
                    <td>
                      {c.is_default ? (
                        <span className="badge" title={`Gets the emails for ${who}`}>
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
        <p className="empty">No contacts yet.</p>
      )}
      <EmailRecipientNote contacts={contacts} who={who} />
      {editing && available.length > 0 && (
        <form
          className="link-form"
          onSubmit={(event) => {
            const { contact } = formValues(event);
            if (contact) link.mutate({ owner, owner_id: ownerId, contact_id: contact });
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
      )}
      {/* The same line as on a contact's page; it explains why there's nothing to choose when that's the case. */}
      {editing && (
        <p className="muted small">
          {available.length === 0 && (all.data?.length ? "Every contact is already linked. " : "No contacts yet. ")}
          <Link to="/contacts/new">Add a contact</Link>
        </p>
      )}
    </>
  );
}
