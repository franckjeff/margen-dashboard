-- The colour of each order and production status badge, chosen by admins on the Status colours page
-- and seen by everyone. A status without a row keeps the app's built-in colour.

create table public.status_colors (
  kind text not null check (kind in ('order', 'production')),
  status text not null,
  -- A hex colour such as #ffa94d; the app picks dark or white text to go on it.
  background text not null check (background ~ '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now(),
  primary key (kind, status),
  -- Same lists as the check constraints on orders.order_status and orders.production_status.
  constraint status_colors_known_status check (
    (kind = 'order' and status in ('received', 'accepted', 'in_production', 'done', 'on_hold', 'cancelled'))
    or (kind = 'production' and status in ('artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'))
  )
);

alter table public.status_colors enable row level security;

-- Every signed-in user sees the badges, so everyone reads the colours; only admins change them.
create policy "Signed-in users read the status colours" on public.status_colors
  for select to authenticated using (true);
create policy "Admins add status colours" on public.status_colors
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins change status colours" on public.status_colors
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins remove status colours" on public.status_colors
  for delete to authenticated using ((select private.is_admin()));

revoke all on public.status_colors from anon;
