-- Order status gets "Done", after In production.
alter table public.orders drop constraint orders_order_status_check;
alter table public.orders add constraint orders_order_status_check
  check (order_status in ('received', 'accepted', 'in_production', 'done', 'on_hold', 'cancelled', 'closed'));
