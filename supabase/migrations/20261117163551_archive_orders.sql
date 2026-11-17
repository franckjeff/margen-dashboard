-- Orders can be archived, whatever their status: they move from the Orders page to Archived orders.
-- Only admins archive: factory users can't change it (limit_factory_order_changes allows only production
-- and shipping) and client users can't change orders at all. The order history records it.
alter table public.orders add column archived_at timestamptz;
create index orders_archived_at_idx on public.orders (archived_at);

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
    'estimated_ship_date', 'actual_ship_date', 'shipping_method', 'tracking_number', 'archived_at'
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
