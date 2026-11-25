-- Leads get the same notes as contacts, athletes, organizations, factories and orders: a timeline that shows who
-- wrote each note and when. Only admins see leads, so the existing "Admins have full access to notes" rule covers them.
--
-- leads.notes stays as the lead's Message: what they wrote when they sent a quote request from the home page,
-- which the quote request email shows. The app shows it read-only.

alter table public.notes add column lead_id uuid references public.leads (id) on delete cascade;
create index notes_lead_id_idx on public.notes (lead_id);

alter table public.notes drop constraint notes_one_subject;
alter table public.notes add constraint notes_one_subject
  check (num_nonnulls(contact_id, athlete_id, factory_id, organization_id, order_id, lead_id) = 1);

comment on column public.leads.notes is
  'The message the lead wrote with their quote request (Order Entry home page). Admin notes about a lead are in public.notes.';
