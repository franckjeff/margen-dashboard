create table public.organization_contacts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, contact_id)
);

create index organization_contacts_contact_id_idx on public.organization_contacts (contact_id);

alter table public.organization_contacts enable row level security;
