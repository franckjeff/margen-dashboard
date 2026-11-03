-- Notes can now be about an organization; each note still belongs to exactly one subject and goes with it.
alter table public.notes add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.notes drop constraint notes_one_subject;
alter table public.notes add constraint notes_one_subject
  check (num_nonnulls(contact_id, athlete_id, factory_id, organization_id) = 1);

create index notes_organization_id_idx on public.notes (organization_id, created_at desc);
