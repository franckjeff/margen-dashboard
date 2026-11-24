-- Order and production statuses follow the status flow, for everyone (admins included); nobody jumps a step.
--
-- A new order starts Received, with production Not started and no factory.
-- Order status, changed by hand:
--   - Received -> Accepted, and back (one step);
--   - Received, Accepted or In production -> Cancelled. Shipped and Cancelled orders stay as they are;
--   - Accepted -> In production only for an order that already has a factory.
--   In production and Shipped otherwise come from the flow itself: assigning a factory moves an Accepted
--   order to In production (orders_production_on_assignment), production Shipped marks the order Shipped
--   and stepping production back off Shipped puts it back (orders_ship_with_production).
-- Factory: assigned, moved or taken off only while the order is Accepted or In production. It can't be
--   taken off once production has gone past Accepted.
-- Production status: one step at a time, forward or back
--   (Not started, Received, Accepted, Artwork in progress, In printing queue, Sewing, Trimming, Shipped),
--   only while the order is In production; a Shipped order can only step production back from Shipped.
--
-- Changes from outside the app (SQL editor, service key: no signed-in user) aren't checked, so data can
-- still be repaired by hand.
--
-- BEFORE triggers run in name order: this one runs after orders_limit_factory_changes (so a factory user
-- trying a field it may not change still gets the permission error) and before the triggers that move
-- statuses automatically, so it checks only what was asked for, not what the flow then does.

create function private.status_label(status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when status is null then 'Not started' else upper(left(status, 1)) || replace(substr(status, 2), '_', ' ') end
$$;

create function private.check_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  steps constant text[] := array['not_started', 'received', 'accepted', 'artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'];
  old_step int;
  new_step int;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Only admins add orders: anyone else gets the permission error from the row rules instead.
    if not (select private.is_admin()) then
      return new;
    end if;
    if new.order_status <> 'received' or new.production_status is not null then
      raise exception 'A new order starts as Received, with production Not started.' using errcode = '23514';
    end if;
    if new.factory_id is not null then
      raise exception 'Accept the order before assigning it to a factory.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.order_status is distinct from old.order_status and not (
       (old.order_status = 'received' and new.order_status = 'accepted')
    or (old.order_status = 'accepted' and new.order_status = 'received')
    or (old.order_status = 'accepted' and new.order_status = 'in_production' and new.factory_id is not null)
    or (old.order_status in ('received', 'accepted', 'in_production') and new.order_status = 'cancelled')
  ) then
    raise exception '%',
      case
        when old.order_status in ('shipped', 'cancelled') then
          format('Order %s is %s: its status can''t change any more.', old.margen_order_id, private.status_label(old.order_status))
        when new.order_status = 'in_production' then
          'An order goes In production when it is assigned to a factory.'
        when new.order_status = 'shipped' then
          'An order is marked Shipped when its production is set to Shipped.'
        else
          format('An order can''t go from %s to %s: statuses follow the flow one step at a time.',
            private.status_label(old.order_status), private.status_label(new.order_status))
      end
      using errcode = '23514';
  end if;

  if new.factory_id is distinct from old.factory_id then
    if new.order_status not in ('accepted', 'in_production') then
      raise exception 'Only an Accepted or In production order can be assigned to a factory, moved or taken off it.' using errcode = '23514';
    end if;
    if new.factory_id is null and coalesce(old.production_status, 'not_started') not in ('not_started', 'received', 'accepted') then
      raise exception 'Production has started (%), so the order can''t be taken off its factory; move it to another factory instead.',
        private.status_label(old.production_status) using errcode = '23514';
    end if;
  end if;

  if new.production_status is distinct from old.production_status then
    old_step := array_position(steps, coalesce(old.production_status, 'not_started'));
    new_step := array_position(steps, coalesce(new.production_status, 'not_started'));
    if abs(new_step - old_step) <> 1 then
      raise exception 'Production can''t go from % to %: change it one step at a time.',
        private.status_label(old.production_status), private.status_label(new.production_status) using errcode = '23514';
    end if;
    if not (old.order_status = 'in_production' or (old.order_status = 'shipped' and new_step < old_step)) then
      raise exception 'Production can only change while the order is In production.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.check_status_flow() from public, anon, authenticated;

create trigger orders_must_follow_status_flow
  before insert or update on public.orders
  for each row execute function private.check_status_flow();
