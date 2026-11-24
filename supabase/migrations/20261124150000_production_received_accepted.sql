-- Production status gets two first steps, "Received" and "Accepted", before Artwork in progress.
--
-- An order assigned to a factory starts at Received instead of Not started (no production status),
-- and the factory moves it to Accepted, then on through the other steps. Moving the order to another
-- factory starts it at Received again unless work has gone past Accepted; taking the factory off an
-- order that hadn't gone past Accepted sets it back to Not started. Assigned orders still at Not
-- started are set to Received now.
--
-- BEFORE triggers run in name order: this one runs after orders_limit_factory_changes (factory users
-- can't change the factory anyway) and before orders_ship_with_production.

alter table public.orders drop constraint orders_production_status_check;
alter table public.orders add constraint orders_production_status_check
  check (production_status in ('received', 'accepted', 'artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'));

alter table public.status_colors drop constraint status_colors_known_status;
alter table public.status_colors add constraint status_colors_known_status check (
  (kind = 'order' and status in ('received', 'accepted', 'in_production', 'shipped', 'cancelled'))
  or (kind = 'production' and status in ('received', 'accepted', 'artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'))
);

create function private.production_on_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.factory_id is not distinct from old.factory_id then
    return new;
  end if;
  if new.factory_id is null then
    if new.production_status in ('received', 'accepted') then
      new.production_status := null;
    end if;
  elsif new.production_status is null or new.production_status in ('received', 'accepted') then
    new.production_status := 'received';
  end if;
  return new;
end;
$$;

create trigger orders_production_on_assignment
  before insert or update of factory_id on public.orders
  for each row execute function private.production_on_assignment();

update public.orders set production_status = 'received'
where factory_id is not null and production_status is null;
