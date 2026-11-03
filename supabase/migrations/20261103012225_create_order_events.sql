-- Audit trail for orders: one row per insert, update or delete, written by a trigger,
-- so every change is captured whichever screen or tool made it.
-- changes holds { field: { "from": old, "to": new } } for the fields that changed.
-- order_id has no foreign key on purpose: the trail outlives a deleted order.
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  margen_order_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  changes jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index order_events_order_id_idx on public.order_events (order_id, changed_at desc);
create index order_events_changed_by_idx on public.order_events (changed_by);

alter table public.order_events enable row level security;

-- Admins can read the trail. There are no insert, update or delete policies, so nobody can
-- write or alter it through the API; only the trigger below (security definer) adds rows.
create policy "Admins can read order events" on public.order_events
  for select to authenticated using ((select private.is_admin()));

create function private.log_order_event()
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
  old_org text;
  new_org text;
begin
  foreach field in array array['margen_order_id', 'factory_order_id', 'order_status', 'production_status'] loop
    if old_row -> field is distinct from new_row -> field then
      changes := changes || jsonb_build_object(field, jsonb_build_object('from', old_row -> field, 'to', new_row -> field));
    end if;
  end loop;

  -- Store the organization by name, so the trail still reads right if it is renamed or removed later.
  if old_row -> 'organization_id' is distinct from new_row -> 'organization_id' then
    select name into old_org from public.organizations where id = (old_row ->> 'organization_id')::uuid;
    select name into new_org from public.organizations where id = (new_row ->> 'organization_id')::uuid;
    changes := changes || jsonb_build_object('organization', jsonb_build_object('from', old_org, 'to', new_org));
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

create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function private.log_order_event();

-- Orders that existed before the audit trail start with a "created" event at their original date.
insert into public.order_events (order_id, margen_order_id, action, changes, changed_at)
select o.id, o.margen_order_id, 'created',
  jsonb_strip_nulls(jsonb_build_object(
    'margen_order_id', jsonb_build_object('to', o.margen_order_id),
    'factory_order_id', case when o.factory_order_id is not null then jsonb_build_object('to', o.factory_order_id) end,
    'organization', case when org.name is not null then jsonb_build_object('to', org.name) end,
    'order_status', jsonb_build_object('to', o.order_status),
    'production_status', case when o.production_status is not null then jsonb_build_object('to', o.production_status) end
  )),
  o.created_at
from public.orders o
left join public.organizations org on org.id = o.organization_id;
