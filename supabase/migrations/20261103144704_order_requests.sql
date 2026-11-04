-- Order requests: orders sent by clients from the public Order Entry page (#/order), without signing in.
-- Admins review each one and turn it into a real order, or reject it.
-- The public never touches these tables directly: it can only call order_entry_items() and
-- submit_order_request() below. Only admins can read or change requests.

create table public.order_requests (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null check (length(btrim(organization_name)) between 1 and 200),
  contact_name text not null check (length(btrim(contact_name)) between 1 and 200),
  email text not null check (length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (length(phone) <= 50),
  notes text check (length(notes) <= 5000),
  -- The order template the client uploaded, if they used one (its lines are read into order_request_lines).
  file_name text check (length(file_name) <= 255),
  status text not null default 'new' check (status in ('new', 'converted', 'rejected')),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_requests_created_at_idx on public.order_requests (created_at desc);
create index order_requests_order_id_idx on public.order_requests (order_id);

create table public.order_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.order_requests(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  size text not null check (size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '2', '4', '6', '8', '10', '12', '14', '16')),
  quantity integer not null check (quantity between 1 and 100000),
  constraint order_request_lines_one_per_size unique (request_id, item_id, size)
);

create index order_request_lines_item_id_idx on public.order_request_lines (item_id);

alter table public.order_requests enable row level security;
alter table public.order_request_lines enable row level security;

create policy "Admins have full access to order requests" on public.order_requests
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins have full access to order request lines" on public.order_request_lines
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- The item names clients choose from on the Order Entry page. Nothing else about items is public.
create function public.order_entry_items()
returns table (id uuid, item_code text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.item_code, i.name from public.items i order by i.name;
$$;

-- Saves a client's order request and its lines in one go. Anyone may call it, signed in or not.
-- website is a trap field hidden from people: bots that fill it in are quietly ignored.
create function public.submit_order_request(
  organization_name text,
  contact_name text,
  email text,
  phone text,
  notes text,
  file_name text,
  lines jsonb,
  website text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request uuid;
  clean_email text := lower(btrim(email));
begin
  if coalesce(btrim(website), '') <> '' then
    return;
  end if;

  -- Limits against floods: per email address, and for the whole page.
  if (select count(*) from public.order_requests r where r.email = clean_email and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve sent several order requests in the last hour. Please wait a little before sending another.';
  end if;
  if (select count(*) from public.order_requests r where r.created_at > now() - interval '1 hour') >= 50 then
    raise exception 'We''re receiving a lot of order requests right now. Please try again in an hour.';
  end if;

  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'Add at least one item to your order.';
  end if;
  if jsonb_array_length(lines) > 500 then
    raise exception 'An order request can have at most 500 lines.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(lines) l
    where not exists (select 1 from public.items i where i.id::text = l->>'item_id')
       or coalesce(l->>'size', '') not in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '2', '4', '6', '8', '10', '12', '14', '16')
       or case when l->>'quantity' ~ '^[0-9]{1,5}$' then (l->>'quantity')::integer < 1 else true end
  ) then
    raise exception 'Some lines have an unknown item or size, or a quantity that isn''t a whole number from 1 to 99999.';
  end if;

  insert into public.order_requests (organization_name, contact_name, email, phone, notes, file_name)
  values (
    btrim(organization_name),
    btrim(contact_name),
    clean_email,
    nullif(btrim(phone), ''),
    nullif(btrim(notes), ''),
    nullif(btrim(file_name), '')
  )
  returning id into request;

  -- The same item and size entered twice becomes one line with the quantities added up.
  insert into public.order_request_lines (request_id, item_id, size, quantity)
  select request, (l->>'item_id')::uuid, l->>'size', sum((l->>'quantity')::integer)
  from jsonb_array_elements(lines) l
  group by (l->>'item_id')::uuid, l->>'size';
end;
$$;

-- Admins: turns a new request into an order with the same lines, and marks the request converted.
-- Runs with the caller's own rights, so the usual admin-only rules on orders still apply.
create function public.convert_order_request(request_id uuid, margen_order_id text, organization_id uuid)
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

-- New functions can be called by everyone by default; say exactly who may call each one.
revoke all on function public.order_entry_items() from public, anon, authenticated;
revoke all on function public.submit_order_request(text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.convert_order_request(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.order_entry_items() to anon, authenticated;
grant execute on function public.submit_order_request(text, text, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.convert_order_request(uuid, text, uuid) to authenticated;
