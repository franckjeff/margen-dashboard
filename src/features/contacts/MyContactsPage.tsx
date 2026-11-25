import { Link, useNavigate } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { Dialog } from "../../components/Dialog";
import { useNotice } from "../../components/Notice";
import { Count, EmailInput, FormButtons, OrDash, Optional, PanelHead, loadingState } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useMyContacts, type MyContact } from "../../data/queries";
import { fullName } from "../../lib/format";
import { formValues } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";
import { isBusyWith, useLinkActions, type LinkOwner } from "../organizations/links";
import { ContactDetailsFields, Phone } from "./ContactDetails";
import { contactDetailsRow, type ContactDetails } from "./details";
import { useConfirm } from "../../components/Confirm";

type Fields = { first_name: string; last_name: string; email: string | null } & ContactDetails;

// Adds a contact (linked to the user's own factory or organization by the database), or saves one.
function ContactForm({ contact }: { contact?: MyContact }) {
  const navigate = useNavigate();
  const { notify } = useNotice();
  const save = useDbAction({
    tables: ["contacts", "factory_contacts", "organization_contacts"],
    run: async (f: Fields) => {
      // A new contact is added and linked by the database first, then given its phone and addresses.
      const id = contact
        ? contact.id
        : unwrap(await supabase.rpc("add_my_contact", { first_name: f.first_name, last_name: f.last_name, email: f.email ?? undefined }));
      expectRows(
        unwrap(await supabase.from("contacts").update(f).eq("id", id).select("id")),
        "The contact wasn't saved. You may not have permission.",
      );
    },
    // The notice is kept through the move back to the list.
    success: (f) => {
      notify("success", contact ? `Saved ${fullName(f)}.` : `Added ${fullName(f)}.`, { keep: true });
      navigate("/my-contacts");
      return undefined;
    },
    failure: () => (contact ? "Couldn't save the contact" : "Couldn't add the contact"),
  });

  const form = (
    <form
      className="stack"
      onSubmit={(event) => {
        const v = formValues(event);
        if (!v.first_name || !v.last_name) return notify("error", "The contact needs a first and last name.");
        save.mutate({ first_name: v.first_name, last_name: v.last_name, email: v.email.toLowerCase() || null, ...contactDetailsRow(v) });
      }}
    >
      <div className="field-row">
        <label>
          First name
          <input name="first_name" required autoFocus autoComplete="off" defaultValue={contact?.first_name} />
        </label>
        <label>
          Last name
          <input name="last_name" required autoComplete="off" defaultValue={contact?.last_name} />
        </label>
      </div>
      <label>
        <Optional>Email</Optional>
        <EmailInput name="email" autoComplete="off" defaultValue={contact?.email ?? ""} placeholder="Where the app sends this contact's emails" />
      </label>
      <ContactDetailsFields contact={contact} />
      <FormButtons label={contact ? "Save changes" : "Add contact"} cancel="/my-contacts" busy={save.isPending} />
    </form>
  );

  // A new contact is added in a window over the list; an existing one is edited in a panel above it.
  return contact ? (
    <section className="card panel my-contact-form">
      <PanelHead title={`Edit ${fullName(contact)}`} close="/my-contacts" />
      {form}
    </section>
  ) : (
    <Dialog title="Add contact" onClose={() => navigate("/my-contacts")}>
      {form}
    </Dialog>
  );
}

// Factory and client users: the people at their own factory or organization. The default contact
// gets the app's emails about their orders. Admins manage contacts from the Contacts page instead.
export function MyContactsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const ask = useConfirm();
  const { role } = useSignedIn();
  const contacts = useMyContacts(role);
  const { makeDefault, unlink } = useLinkActions();
  const owner: LinkOwner = role === "factory" ? "factory" : "organization";
  const yours = role === "factory" ? "your factory" : "your organization";
  const all = contacts.data ?? [];
  const def = all.find((c) => c.is_default);
  const editingContact = editing ? all.find((c) => c.id === id) : undefined;

  const confirmUnlink = async (c: MyContact) => {
    const extra = c.is_default ? " They're the default contact, so choose another one to keep getting emails." : "";
    if (await ask(`Remove ${fullName(c)} from ${yours}'s contacts?${extra}`)) {
      unlink.mutate({ owner, owner_id: c.owner_id, contact_id: c.id });
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>
          Contacts <Count n={all.length} />
        </h1>
        <Link to="/my-contacts/new" className="button primary">
          Add
        </Link>
      </div>
      {id === "new" && <ContactForm />}
      {editingContact && <ContactForm key={editingContact.id} contact={editingContact} />}
      <section className="card list">
        {loadingState([contacts]) ??
          (all.length ? (
            <table className="static">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th className="hide-sm">Phone</th>
                  <th>Gets emails</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => {
                  const l = { owner, owner_id: c.owner_id, contact_id: c.id };
                  return (
                    <tr key={c.id}>
                      <td className="strong">{fullName(c)}</td>
                      <td>
                        <OrDash>{c.email}</OrDash>
                      </td>
                      <td className="hide-sm">
                        <Phone contact={c} />
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
                      <td className="row-actions">
                        <Link to={`/my-contacts/${c.id}/edit`} className="button ghost small">
                          Edit
                        </Link>
                        <button type="button" className="ghost small" disabled={isBusyWith(unlink, l)} onClick={() => confirmUnlink(c)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">
              No contacts yet.
            </p>
          ))}
      </section>
      <p className="muted small hint">
        {def
          ? def.email
            ? `The app's emails for ${yours} go to ${fullName(def)} (${def.email}).`
            : `${fullName(def)} is the default contact but has no email address, so ${yours} gets no emails. Add one with Edit.`
          : `Choose a default contact to get the app's emails for ${yours}.`}{" "}
        {role === "factory" ? "The app emails when an order is assigned to your factory." : "The app emails when one of your orders ships."}
      </p>
    </>
  );
}
