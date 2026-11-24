-- Contacts get a phone number (and whether it's on WhatsApp) and a billing address.
--
-- The existing address becomes the delivery address. The billing address is either the same as the
-- delivery address (the default, so nothing changes for existing contacts) or its own.
-- Who can see and change contacts is unchanged: admins all of them, factory and client users their own.

alter table public.contacts
  add column phone text check (length(phone) <= 50),
  add column whatsapp boolean not null default false,
  add column billing_same_as_delivery boolean not null default true,
  add column billing_address_line1 text,
  add column billing_address_line2 text,
  add column billing_city text,
  add column billing_state text,
  add column billing_postal_code text,
  add column billing_country text;

comment on column public.contacts.address_line1 is 'Delivery address, first line.';
comment on column public.contacts.whatsapp is 'Whether the phone number is on WhatsApp.';
comment on column public.contacts.billing_same_as_delivery is 'When true, the billing address is the delivery address and the billing_ columns are ignored.';
