-- Order status "On hold" is removed. An order that had it goes back to Accepted (none did when this
-- ran), and a colour chosen for it is dropped.

alter table public.orders drop constraint orders_order_status_check;
alter table public.status_colors drop constraint status_colors_known_status;

update public.orders set order_status = 'accepted' where order_status = 'on_hold';
delete from public.status_colors where kind = 'order' and status = 'on_hold';

alter table public.orders add constraint orders_order_status_check
  check (order_status in ('received', 'accepted', 'in_production', 'shipped', 'cancelled'));
alter table public.status_colors add constraint status_colors_known_status check (
  (kind = 'order' and status in ('received', 'accepted', 'in_production', 'shipped', 'cancelled'))
  or (kind = 'production' and status in ('artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'))
);
