-- Order status gets "In production", between Accepted and On hold. Production status loses
-- "Job sheet approved": an order that had it goes back to not started (none did when this ran).
alter table public.orders drop constraint orders_order_status_check;
alter table public.orders add constraint orders_order_status_check
  check (order_status in ('received', 'accepted', 'in_production', 'on_hold', 'cancelled', 'closed'));

update public.orders set production_status = null where production_status = 'job_sheet_approved';
alter table public.orders drop constraint orders_production_status_check;
alter table public.orders add constraint orders_production_status_check
  check (production_status in ('artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'));
