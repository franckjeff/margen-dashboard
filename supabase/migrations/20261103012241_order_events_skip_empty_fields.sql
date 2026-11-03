-- On create and delete, a missing side is SQL null while an empty column is JSON null, so they
-- compared as different and empty fields were logged as changes. Treat both as JSON null.
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
  old_org text;
  new_org text;
begin
  foreach field in array array['margen_order_id', 'factory_order_id', 'order_status', 'production_status'] loop
    if coalesce(old_row -> field, 'null') is distinct from coalesce(new_row -> field, 'null') then
      changes := changes || jsonb_build_object(field, jsonb_build_object('from', old_row -> field, 'to', new_row -> field));
    end if;
  end loop;

  -- Store the organization by name, so the trail still reads right if it is renamed or removed later.
  if coalesce(old_row -> 'organization_id', 'null') is distinct from coalesce(new_row -> 'organization_id', 'null') then
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
