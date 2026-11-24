-- Order status "Done" is replaced by "Shipped": orders that were Done become Shipped, and so does a
-- colour chosen for Done. The orders' history records the change like any other.
-- Production status keeps its own "Shipped" step; it's separate from the order status.

alter table public.orders drop constraint orders_order_status_check;
alter table public.status_colors drop constraint status_colors_known_status;

update public.orders set order_status = 'shipped' where order_status = 'done';
update public.status_colors set status = 'shipped' where kind = 'order' and status = 'done';

alter table public.orders add constraint orders_order_status_check
  check (order_status in ('received', 'accepted', 'in_production', 'shipped', 'on_hold', 'cancelled'));
alter table public.status_colors add constraint status_colors_known_status check (
  (kind = 'order' and status in ('received', 'accepted', 'in_production', 'shipped', 'on_hold', 'cancelled'))
  or (kind = 'production' and status in ('artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'))
);
