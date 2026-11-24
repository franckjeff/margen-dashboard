-- Assigning an order to a factory moves the order status to In production and leaves production at
-- Not started; the factory then sets the production status itself (Received, Accepted, and on).
-- This replaces the rule from 20261124150000, where assignment set production to Received.
--
-- When the factory changes (assigned, moved to another factory):
--   - the order status becomes In production, unless the order is Shipped or Cancelled;
--   - production goes back to Not started unless work had gone past Accepted.
-- When the factory is taken off:
--   - an order In production goes back to Accepted;
--   - production goes back to Not started unless work had gone past Accepted.
--
-- The trigger (orders_production_on_assignment, before insert or update of factory_id) stays as it is.

create or replace function private.production_on_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.factory_id is not distinct from old.factory_id then
    return new;
  end if;
  if new.production_status in ('received', 'accepted') then
    new.production_status := null;
  end if;
  if new.factory_id is not null then
    if new.order_status not in ('shipped', 'cancelled') then
      new.order_status := 'in_production';
    end if;
  elsif new.order_status = 'in_production' then
    new.order_status := 'accepted';
  end if;
  return new;
end;
$$;

-- 20261124150000 set assigned orders still at Not started to Received. Nobody had used Received before
-- it, so every order at Received now got there that way: put them back to Not started.
update public.orders set production_status = null where production_status = 'received';
