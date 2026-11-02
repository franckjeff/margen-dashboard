create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  country text,
  state text,
  created_at timestamptz not null default now()
);

alter table public.athletes enable row level security;

create policy "Admins have full access to athletes" on public.athletes
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
