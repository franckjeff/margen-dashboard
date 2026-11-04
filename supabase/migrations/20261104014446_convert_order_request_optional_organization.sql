-- The organization is optional when turning an order request into an order. A default makes that
-- visible to the generated TypeScript types, which can't tell otherwise that the argument may be left out.
create or replace function public.convert_order_request(request_id uuid, margen_order_id text, organization_id uuid default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  new_order uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Only admins can turn order requests into orders.';
  end if;
  if not exists (select 1 from public.order_requests r where r.id = request_id and r.status = 'new') then
    raise exception 'This order request has already been handled.';
  end if;
  if coalesce(btrim(margen_order_id), '') = '' then
    raise exception 'Enter a Margen order ID.';
  end if;

  insert into public.orders (margen_order_id, organization_id)
  values (btrim(margen_order_id), organization_id)
  returning id into new_order;

  insert into public.order_items (order_id, item_id, size, quantity)
  select new_order, l.item_id, l.size, l.quantity
  from public.order_request_lines l
  where l.request_id = convert_order_request.request_id;

  update public.order_requests r set status = 'converted', order_id = new_order where r.id = request_id;
  return new_order;
end;
$$;
