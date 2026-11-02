-- Orders, shown under the Customs menu.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  margen_order_id text not null unique,   -- e.g. 2026_1_OUTRIGGER
  factory_order_id text unique,           -- e.g. RKU12060-M; may be assigned by the factory later
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index orders_organization_id_idx on public.orders (organization_id);

alter table public.orders enable row level security;

create policy "Admins have full access to orders" on public.orders
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
