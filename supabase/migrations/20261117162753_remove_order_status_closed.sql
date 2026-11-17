-- Order status "Closed" is replaced by "Done": an order that had it becomes Done (none did when this ran).
update public.orders set order_status = 'done' where order_status = 'closed';
alter table public.orders drop constraint orders_order_status_check;
alter table public.orders add constraint orders_order_status_check
  check (order_status in ('received', 'accepted', 'in_production', 'done', 'on_hold', 'cancelled'));
