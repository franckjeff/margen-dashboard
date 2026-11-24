import type { Tables } from "../../lib/database.types";
import { ADDRESS_FIELDS, BILLING_FIELDS } from "../../lib/constants";
import { orNull } from "../../lib/forms";

type AddressField = (typeof ADDRESS_FIELDS)[number];
type BillingField = (typeof BILLING_FIELDS)[number];

// A contact's phone (and whether it's on WhatsApp), delivery address and billing address.
export type ContactDetails = Pick<Tables<"contacts">, "phone" | "whatsapp" | "billing_same_as_delivery" | AddressField | BillingField>;

// The billing address in the same shape as the delivery address, for addressLines().
export const billingOf = (c: ContactDetails) => ({
  address_line1: c.billing_address_line1,
  address_line2: c.billing_address_line2,
  city: c.billing_city,
  state: c.billing_state,
  postal_code: c.billing_postal_code,
  country: c.billing_country,
});

// The saved row from a submitted form. A billing address that's the delivery address isn't kept twice.
export function contactDetailsRow(v: Record<string, string>): ContactDetails {
  const same = v.billing_same_as_delivery === "on";
  return {
    phone: orNull(v.phone),
    whatsapp: v.whatsapp === "on",
    billing_same_as_delivery: same,
    ...(Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, orNull(v[f])])) as Record<AddressField, string | null>),
    ...(Object.fromEntries(BILLING_FIELDS.map((f) => [f, same ? null : orNull(v[f])])) as Record<BillingField, string | null>),
  };
}
