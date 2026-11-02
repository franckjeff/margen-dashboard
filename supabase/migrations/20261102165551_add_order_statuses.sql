-- Order status (commercial side) and production status (factory side).
-- New orders start as "received"; an empty production status means production hasn't started.
alter table public.orders
  add column order_status text not null default 'received'
    check (order_status in ('received', 'accepted', 'on_hold', 'cancelled', 'closed'));

alter table public.orders
  add column production_status text
    check (production_status in (
      'job_sheet_approved', 'artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'
    ));
