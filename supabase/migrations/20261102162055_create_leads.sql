-- Prospective clients, tracked until they are converted (or lost).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  organization_name text,
  email text,
  phone text,
  state text,
  country text,
  source text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create policy "Admins have full access to leads" on public.leads
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
