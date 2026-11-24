import { useState } from "react";
import { Dash, Optional } from "../../components/ui";
import { addressLines } from "../../lib/format";
import { billingOf, type ContactDetails } from "./details";

// The phone and address fields and views, shared by the admins' Contacts page and the factory and client
// users' own Contacts page.

function AddressInputs({ prefix = "", values }: { prefix?: "" | "billing_"; values: Partial<Record<string, string | null>> }) {
  const field = (name: string) => ({ name: `${prefix}${name}`, autoComplete: "off", defaultValue: values[`${prefix}${name}`] ?? "" });
  return (
    <>
      <label>
        Address line 1
        <input {...field("address_line1")} placeholder="Street and number" />
      </label>
      <label>
        Address line 2
        <input {...field("address_line2")} placeholder="Apartment, suite, building…" />
      </label>
      <div className="field-row">
        <label>
          City
          <input {...field("city")} />
        </label>
        <label>
          Postal code
          <input {...field("postal_code")} />
        </label>
      </div>
      <div className="field-row">
        <label>
          State / region
          <input {...field("state")} />
        </label>
        <label>
          Country
          <input {...field("country")} />
        </label>
      </div>
    </>
  );
}

// The form fields; read them back with contactDetailsRow().
export function ContactDetailsFields({ contact }: { contact?: ContactDetails }) {
  const [same, setSame] = useState(contact?.billing_same_as_delivery ?? true);
  const values = contact ?? {};
  return (
    <>
      <div className="field-row contact-phone">
        <label>
          <Optional>Phone</Optional>
          <input name="phone" type="tel" maxLength={50} autoComplete="off" defaultValue={contact?.phone ?? ""} placeholder="With the country code, e.g. +33 6 12 34 56 78" />
        </label>
        <label className="check">
          <input name="whatsapp" type="checkbox" defaultChecked={contact?.whatsapp ?? false} />
          On WhatsApp
        </label>
      </div>
      <fieldset className="stack">
        <legend>
          Delivery address <span className="muted">(optional)</span>
        </legend>
        <AddressInputs values={values} />
      </fieldset>
      <fieldset className="stack">
        <legend>
          Billing address <span className="muted">(optional)</span>
        </legend>
        <label className="check">
          <input name="billing_same_as_delivery" type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
          Same as the delivery address
        </label>
        {!same && <AddressInputs prefix="billing_" values={values} />}
      </fieldset>
    </>
  );
}

// A phone number to call, with a WhatsApp link when it's on WhatsApp.
export function Phone({ contact }: { contact: Pick<ContactDetails, "phone" | "whatsapp"> }) {
  if (!contact.phone) return <Dash />;
  const digits = contact.phone.replace(/[^\d]/g, "");
  return (
    <span className="phone">
      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>
      {contact.whatsapp && digits && (
        <a className="badge whatsapp" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" title="Open a WhatsApp chat">
          WhatsApp
        </a>
      )}
    </span>
  );
}

const Lines = ({ lines }: { lines: string[] }) =>
  lines.length ? (
    <>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </>
  ) : (
    <Dash />
  );

export const DeliveryAddress = ({ contact }: { contact: ContactDetails }) => <Lines lines={addressLines(contact)} />;

export const BillingAddress = ({ contact }: { contact: ContactDetails }) =>
  contact.billing_same_as_delivery ? <span className="muted">Same as the delivery address</span> : <Lines lines={addressLines(billingOf(contact))} />;
