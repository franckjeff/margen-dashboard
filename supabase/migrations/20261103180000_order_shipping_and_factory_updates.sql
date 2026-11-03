-- Shipping details on orders, and factory users may update two of them on their own factory's orders.

alter table public.orders
  add column estimated_ship_date date,
  add column actual_ship_date date,
  add column shipping_method text,   -- e.g. DHL Express, sea freight
  add column tracking_number text;   -- shown as "Tracker" in the app

-- Factory users can update their factory's orders, but only the production status and the
-- estimated shipping date (enforced by the trigger below). They can't move an order to another factory.
create policy "Factory users update their factory's orders" on public.orders
  for update to authenticated
  using (factory_id = (select private.my_factory()))
  with check (factory_id = (select private.my_factory()));

create function private.limit_factory_order_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only factory users are limited; admins and changes from outside the app are not.
  if (select private.my_factory()) is null then
    return new;
  end if;
  if (to_jsonb(new) - array['production_status', 'estimated_ship_date'])
     is distinct from (to_jsonb(old) - array['production_status', 'estimated_ship_date']) then
    raise exception 'Factories can only change the production status and the estimated shipping date.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_factory_order_changes() from public, anon, authenticated;

create trigger orders_limit_factory_changes
  before update on public.orders
  for each row execute function private.limit_factory_order_changes();

-- Record the shipping details in the order history too.
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
  foreach field in array array[
    'margen_order_id', 'factory_order_id', 'order_status', 'production_status',
    'estimated_ship_date', 'actual_ship_date', 'shipping_method', 'tracking_number'
  ] loop
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
