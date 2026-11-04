-- Factories that make MARGEN's orders. An order is assigned to at most one factory; new orders
-- start unassigned and admins assign them. A factory can't be deleted while orders are assigned to it.
create table public.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  country text,
  created_at timestamptz not null default now()
);

alter table public.factories enable row level security;

create policy "Admins have full access to factories" on public.factories
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.orders add column factory_id uuid references public.factories(id) on delete restrict;

create index orders_factory_id_idx on public.orders (factory_id);

-- Record factory assignments in the order history, by name like the organization.
create or replace function private.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  changes jsonb := '{}'::jsonb;
  field text;
  old_name text;
  new_name text;
begin
  foreach field in array array['margen_order_id', 'factory_order_id', 'order_status', 'production_status'] loop
    if coalesce(old_row -> field, 'null') is distinct from coalesce(new_row -> field, 'null') then
      changes := changes || jsonb_build_object(field, jsonb_build_object('from', old_row -> field, 'to', new_row -> field));
    end if;
  end loop;

  -- Store the organization and factory by name, so the trail still reads right if they are renamed or removed later.
  if coalesce(old_row -> 'organization_id', 'null') is distinct from coalesce(new_row -> 'organization_id', 'null') then
    select name into old_name from public.organizations where id = (old_row ->> 'organization_id')::uuid;
    select name into new_name from public.organizations where id = (new_row ->> 'organization_id')::uuid;
    changes := changes || jsonb_build_object('organization', jsonb_build_object('from', old_name, 'to', new_name));
  end if;

  if coalesce(old_row -> 'factory_id', 'null') is distinct from coalesce(new_row -> 'factory_id', 'null') then
    old_name := null;
    new_name := null;
    select name into old_name from public.factories where id = (old_row ->> 'factory_id')::uuid;
    select name into new_name from public.factories where id = (new_row ->> 'factory_id')::uuid;
    changes := changes || jsonb_build_object('factory', jsonb_build_object('from', old_name, 'to', new_name));
  end if;

  if tg_op = 'UPDATE' and changes = '{}'::jsonb then
    return null;
  end if;

  insert into public.order_events (order_id, margen_order_id, action, changes, changed_by)
  values (
    coalesce(new.id, old.id),
    coalesce(new.margen_order_id, old.margen_order_id),
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    changes,
    -- Null when the change came from outside the app (SQL editor, service key).
    (select id from public.profiles where id = auth.uid())
  );
  return null;
end;
$$;

revoke all on function private.log_order_event() from public, anon, authenticated;
