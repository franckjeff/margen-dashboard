-- Factories get a description and a required main contact, and can have notes like contacts and athletes.

alter table public.factories add column description text;

-- Every factory has exactly one main contact. A contact can't be deleted while it's a factory's main contact.
alter table public.factories add column contact_id uuid references public.contacts(id) on delete restrict;

-- The one factory that existed before this change: its main contact, chosen by the admin.
update public.factories f
set contact_id = c.id
from public.contacts c
where f.name = 'Red Knot Ltd' and c.first_name = 'Tiffany' and c.last_name = 'Apria' and f.contact_id is null;

alter table public.factories alter column contact_id set not null;

create index factories_contact_id_idx on public.factories (contact_id);

-- Notes can now be about a factory; each note still belongs to exactly one subject and goes with it.
alter table public.notes add column factory_id uuid references public.factories(id) on delete cascade;

alter table public.notes drop constraint notes_one_subject;
alter table public.notes add constraint notes_one_subject check (num_nonnulls(contact_id, athlete_id, factory_id) = 1);

create index notes_factory_id_idx on public.notes (factory_id, created_at desc);
