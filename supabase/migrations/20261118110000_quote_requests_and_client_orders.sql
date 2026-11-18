-- Quote requests and orders are now separate.
-- * "Request a quote" on the public page creates a lead (Leads page) and emails every admin.
--   It's a conversation starter, so it has no items, sizes or quantities.
-- * Orders with items and sizes (order requests) can only be sent by signed-in clients, and admins.

-- ---------- Quote requests become leads ----------

-- Each admin's email about a quote request points at its lead.
alter table public.email_outbox add column lead_id uuid references public.leads(id) on delete cascade;
create index email_outbox_lead_id_idx on public.email_outbox (lead_id);

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request'));

drop index public.email_outbox_one_waiting;
create unique index email_outbox_one_waiting on public.email_outbox (kind, coalesce(order_id, order_request_id, lead_id), recipient_email)
  where status in ('pending', 'sending');

-- Saves a quote request as a new lead and tells every admin. Anyone may call it, signed in or not.
-- website is a trap field hidden from people: bots that fill it in are quietly ignored.
create function public.submit_quote_request(
  first_name text,
  last_name text,
  organization_name text,
  email text,
  phone text,
  country text,
  message text,
  website text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(btrim(email));
  lead uuid;
begin
  if coalesce(btrim(website), '') <> '' then
    return;
  end if;

  if coalesce(btrim(first_name), '') = '' or coalesce(btrim(last_name), '') = '' then
    raise exception 'Please enter your first and last name.';
  end if;
  if clean_email is null or length(clean_email) > 320 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  if coalesce(btrim(message), '') = '' then
    raise exception 'Tell us what you''d like a quote for.';
  end if;
  if length(first_name) > 100 or length(last_name) > 100 or length(organization_name) > 200
     or length(phone) > 50 or length(country) > 100 or length(message) > 5000 then
    raise exception 'Some of your answers are too long.';
  end if;

  -- Limits against floods: per email address, and for the whole page.
  if (select count(*) from public.leads l
      where l.source = 'Quote request' and l.email = clean_email and l.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You''ve sent several quote requests in the last hour. Please wait a little before sending another.';
  end if;
  if (select count(*) from public.leads l where l.source = 'Quote request' and l.created_at > now() - interval '1 hour') >= 50 then
    raise exception 'We''re receiving a lot of quote requests right now. Please try again in an hour.';
  end if;

  insert into public.leads (first_name, last_name, organization_name, email, phone, country, source, notes)
  values (btrim(first_name), btrim(last_name), nullif(btrim(organization_name), ''), clean_email,
          nullif(btrim(phone), ''), nullif(btrim(country), ''), 'Quote request', btrim(message))
  returning id into lead;

  -- Every admin, straight away.
  insert into public.email_outbox (kind, lead_id, recipient_id, recipient_name, recipient_email, send_after)
  select 'quote_request', lead, p.id, p.first_name, lower(btrim(p.email)), now()
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> ''
  on conflict do nothing;
end;
$$;

revoke all on function public.submit_quote_request(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_quote_request(text, text, text, text, text, text, text, text) to anon, authenticated;

-- What a quote request email shows: the lead's details, and the admin's first name for the greeting.
create function private.lead_email_details(lead_id uuid, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contact_name', btrim(l.first_name || ' ' || l.last_name),
    'organization_name', l.organization_name,
    'email', l.email,
    'phone', l.phone,
    'country', l.country,
    'notes', l.notes,
    'first_name', (select p.first_name from public.profiles p where p.id = lead_email_details.recipient_id))
  from public.leads l
  where l.id = lead_email_details.lead_id;
$$;

revoke all on function private.lead_email_details(uuid, uuid) from public, anon, authenticated;

-- As before, with the lead's details for quote request emails.
create or replace function public.claim_due_emails(secret text, batch integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings public.email_settings;
  emails jsonb;
begin
  if secret is null or secret is distinct from
     (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_secret') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  -- Emails stuck mid-send (the function stopped half way) are tried again.
  update public.email_outbox o set status = 'pending'
  where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes';

  select * into settings from public.email_settings;
  if settings.mode = 'off' then
    return jsonb_build_object('settings', to_jsonb(settings), 'emails', '[]'::jsonb);
  end if;

  with due as (
    select o.id from public.email_outbox o
    where o.status = 'pending' and o.send_after <= now()
    order by o.send_after
    limit least(greatest(batch, 1), 50)
    for update skip locked
  ), claimed as (
    update public.email_outbox o
    set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
    from due where o.id = due.id
    returning o.*
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('details',
           case when c.lead_id is not null then private.lead_email_details(c.lead_id, c.recipient_id)
                else private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id) end)), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;

-- ---------- Orders: signed-in clients only ----------

-- As before, but only for signed-in clients and admins. The order form is now inside the app.
create or replace function public.submit_order_request(
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
  if not (select private.is_admin())
     and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'client') then
    raise exception 'Sign in with your client account to send an order.' using errcode = '42501';
  end if;

  if coalesce(btrim(website), '') <> '' then
    return;
  end if;

  -- Limits against floods: per email address, and for the whole app.
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

-- The public can no longer send orders, nor list the items they're made of.
revoke execute on function public.submit_order_request(text, text, text, text, text, text, jsonb, text) from anon;
revoke execute on function public.order_entry_items() from anon;
