-- Only Shipped orders can be archived (admins archive; factory and client users can't change archived_at
-- anyway). While an order is archived its order status, production status and factory stay as they are;
-- unarchive it first. Unarchiving is always allowed, so orders archived earlier at another status can
-- still be brought back. Changes from outside the app (SQL editor, service key) aren't checked, as before.
--
-- This replaces private.check_status_flow() from 20261124170000_order_status_flow.sql, adding the archive
-- rules; the trigger (orders_must_follow_status_flow, before insert or update) stays as it is.

create or replace function private.check_status_flow()
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
    if new.archived_at is not null then
      raise exception 'Only Shipped orders can be archived.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Archiving: only a Shipped order, and an archived order's statuses and factory stay as they are until
  -- it is unarchived. Unarchiving is always allowed.
  if old.archived_at is null and new.archived_at is not null and new.order_status <> 'shipped' then
    raise exception 'Only Shipped orders can be archived.' using errcode = '23514';
  end if;
  if old.archived_at is not null and new.archived_at is not null and (
       new.order_status is distinct from old.order_status
    or new.production_status is distinct from old.production_status
    or new.factory_id is distinct from old.factory_id
  ) then
    raise exception 'Order % is archived: unarchive it before changing its status or factory.', old.margen_order_id using errcode = '23514';
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
