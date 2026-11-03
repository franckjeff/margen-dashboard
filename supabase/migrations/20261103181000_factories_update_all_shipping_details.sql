-- Factory users may also change the actual shipping date, the shipping method and the tracker,
-- on top of the production status and the estimated shipping date.
create or replace function private.limit_factory_order_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array['production_status', 'estimated_ship_date', 'actual_ship_date', 'shipping_method', 'tracking_number'];
begin
  -- Only factory users are limited; admins and changes from outside the app are not.
  if (select private.my_factory()) is null then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Factories can only change the production status and the shipping details.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_factory_order_changes() from public, anon, authenticated;
