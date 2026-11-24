-- Setting the production status to Shipped also marks the order Shipped, whoever makes the change
-- (admins, factory users, an import). Taking production back off Shipped, to undo a mistake, puts an
-- order that is still Shipped back to In production, since factory users can't change the order status.
-- Orders already shipped in production are marked Shipped now.
--
-- BEFORE UPDATE triggers run in name order, so this one runs after orders_limit_factory_changes has
-- checked what a factory user changed: the order status it sets here doesn't count against them.

create function private.ship_order_with_production()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only when production changes, so an admin can still set the order status by hand afterwards.
  if tg_op = 'UPDATE' and new.production_status is not distinct from old.production_status then
    return new;
  end if;
  if new.production_status = 'shipped' then
    new.order_status := 'shipped';
  elsif tg_op = 'UPDATE' and old.production_status = 'shipped' and new.order_status = 'shipped' then
    new.order_status := 'in_production';
  end if;
  return new;
end;
$$;

create trigger orders_ship_with_production
  before insert or update of production_status on public.orders
  for each row execute function private.ship_order_with_production();

update public.orders set order_status = 'shipped'
where production_status = 'shipped' and order_status <> 'shipped';
