-- Email outbox: emails the app should send, one row per email per person. Database triggers add them
-- when something happens (an order assigned to a factory, an order shipped, a new order request), and
-- the send-emails Edge Function sends them (supabase/functions/send-emails), retrying failures.
-- Nobody adds rows from the browser, and recipients always come from profiles, never from typed text.
-- Admins read the outbox on the Email log page, and can cancel or retry an email there.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('order_assigned', 'order_shipped', 'order_request')),
  order_id uuid references public.orders(id) on delete cascade,
  order_request_id uuid references public.order_requests(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  -- A short wait before sending, so a change made by mistake and undone in time sends nothing.
  send_after timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  -- The email service's id for the message, as proof it was accepted.
  provider_id text,
  created_at timestamptz not null default now()
);

-- The same email to the same person can't be waiting twice.
create unique index email_outbox_one_waiting on public.email_outbox (kind, coalesce(order_id, order_request_id), recipient_email)
  where status in ('pending', 'sending');
create index email_outbox_due_idx on public.email_outbox (send_after) where status = 'pending';
create index email_outbox_created_at_idx on public.email_outbox (created_at desc);
create index email_outbox_order_id_idx on public.email_outbox (order_id);
create index email_outbox_order_request_id_idx on public.email_outbox (order_request_id);
create index email_outbox_recipient_id_idx on public.email_outbox (recipient_id);

alter table public.email_outbox enable row level security;

create policy "Admins read the email outbox" on public.email_outbox
  for select to authenticated using ((select private.is_admin()));
-- Admins cancel or retry emails; nothing else about an email can be changed.
create policy "Admins cancel or retry emails" on public.email_outbox
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
revoke insert, update, delete on public.email_outbox from anon, authenticated;
grant update (status, send_after, attempts, last_error) on public.email_outbox to authenticated;

-- How sending behaves on this project, one row. mode:
--   off       nothing is sent; emails wait in the outbox
--   redirect  every email goes to redirect_to instead of its recipient (for MARGEN TEST)
--   live      emails go to their recipients
create table public.email_settings (
  id boolean primary key default true check (id),
  mode text not null default 'off' check (mode in ('off', 'redirect', 'live')),
  redirect_to text check (redirect_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- The sender, e.g. 'MARGEN <notifications@example.com>'. Resend's test sender works without a domain,
  -- but only delivers to the Resend account's own address.
  from_address text not null default 'MARGEN <onboarding@resend.dev>',
  -- Where links in emails point, e.g. https://margen-dashboard.franckjeff.workers.dev
  app_url text not null default 'http://localhost:5173',
  -- How long a change waits before its email goes out.
  delay_minutes integer not null default 5 check (delay_minutes between 0 and 60),
  constraint email_settings_redirect_needs_address check (mode <> 'redirect' or redirect_to is not null)
);
insert into public.email_settings default values;

alter table public.email_settings enable row level security;
create policy "Admins read the email settings" on public.email_settings
  for select to authenticated using ((select private.is_admin()));

-- Queues one email per address, skipping people without one and anything already waiting.
create function private.queue_emails(kind text, order_id uuid, order_request_id uuid, recipients uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (kind, order_id, order_request_id, recipient_id, recipient_email, send_after)
  select queue_emails.kind, queue_emails.order_id, queue_emails.order_request_id, p.id, lower(btrim(p.email)),
    now() + make_interval(mins => case when queue_emails.kind = 'order_request' then 0
                                       else (select s.delay_minutes from public.email_settings s) end)
  from public.profiles p
  where p.id = any (recipients) and coalesce(btrim(p.email), '') <> ''
  on conflict do nothing;
$$;

-- Cancels emails about an order that haven't gone out yet, when the change behind them is undone.
create function private.cancel_waiting_emails(kind text, order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox o
  set status = 'cancelled', last_error = 'Cancelled: the change was undone before the email went out.'
  where o.kind = cancel_waiting_emails.kind and o.order_id = cancel_waiting_emails.order_id and o.status = 'pending';
$$;

-- Orders: tell a factory when an order is assigned to it, and the client when it ships.
create function private.queue_order_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.factory_id is not null and (tg_op = 'INSERT' or new.factory_id is distinct from old.factory_id) then
    if tg_op = 'UPDATE' then
      perform private.cancel_waiting_emails('order_assigned', new.id);
    end if;
    perform private.queue_emails('order_assigned', new.id, null,
      array(select p.id from public.profiles p where p.role = 'factory' and p.factory_id = new.factory_id));
  elsif tg_op = 'UPDATE' and new.factory_id is null and old.factory_id is not null then
    perform private.cancel_waiting_emails('order_assigned', new.id);
  end if;

  if new.production_status = 'shipped' and new.organization_id is not null
     and (tg_op = 'INSERT' or old.production_status is distinct from 'shipped') then
    perform private.queue_emails('order_shipped', new.id, null,
      array(select p.id from public.profiles p where p.role = 'client' and p.organization_id = new.organization_id));
  elsif tg_op = 'UPDATE' and old.production_status = 'shipped' and new.production_status is distinct from 'shipped' then
    perform private.cancel_waiting_emails('order_shipped', new.id);
  end if;
  return null;
end;
$$;

create trigger orders_queue_emails
  after insert or update of factory_id, production_status, organization_id on public.orders
  for each row execute function private.queue_order_emails();

-- Order requests: tell the admins straight away.
create function private.queue_order_request_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_emails('order_request', null, new.id,
    array(select p.id from public.profiles p where p.role = 'admin'));
  return null;
end;
$$;

create trigger order_requests_queue_emails
  after insert on public.order_requests
  for each row execute function private.queue_order_request_emails();

revoke all on function private.queue_emails(text, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.cancel_waiting_emails(text, uuid) from public, anon, authenticated;
revoke all on function private.queue_order_emails() from public, anon, authenticated;
revoke all on function private.queue_order_request_emails() from public, anon, authenticated;

-- What an email needs to be written, read when it's sent so it shows the latest details
-- (e.g. a tracking link added a minute after the order was marked shipped).
create function private.email_details(order_id uuid, order_request_id uuid, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when email_details.order_id is not null then (
      select jsonb_build_object(
        'margen_order_id', o.margen_order_id,
        'factory_order_id', o.factory_order_id,
        'order_status', o.order_status,
        'production_status', o.production_status,
        'estimated_ship_date', o.estimated_ship_date,
        'actual_ship_date', o.actual_ship_date,
        'shipping_method', o.shipping_method,
        'tracking_number', o.tracking_number,
        'factory_name', f.name,
        'organization_name', org.name,
        'pieces', (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = o.id))
      from public.orders o
      left join public.factories f on f.id = o.factory_id
      left join public.organizations org on org.id = o.organization_id
      where o.id = email_details.order_id)
    else (
      select jsonb_build_object(
        'organization_name', r.organization_name,
        'contact_name', r.contact_name,
        'email', r.email,
        'phone', r.phone,
        'notes', r.notes,
        'pieces', (select coalesce(sum(l.quantity), 0) from public.order_request_lines l where l.request_id = r.id))
      from public.order_requests r
      where r.id = email_details.order_request_id)
  end || jsonb_build_object('first_name', (select p.first_name from public.profiles p where p.id = email_details.recipient_id));
$$;

revoke all on function private.email_details(uuid, uuid, uuid) from public, anon, authenticated;

-- Called by the send-emails function only (with the secret the scheduled job gives it): hands over
-- the emails that are due, marked as being sent, with the settings and the details to write them.
create function public.claim_due_emails(secret text, batch integer default 20)
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
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('details', private.email_details(c.order_id, c.order_request_id, c.recipient_id))), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;

-- Records how a send went: sent, or failed and tried again later (up to 5 attempts).
create function public.finish_email(secret text, email_id uuid, provider_id text, error text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if secret is null or secret is distinct from
     (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_secret') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if error is null then
    update public.email_outbox o
    set status = 'sent', sent_at = now(), provider_id = finish_email.provider_id, last_error = null
    where o.id = email_id and o.status = 'sending';
  else
    update public.email_outbox o
    set status = case when o.attempts >= 5 then 'failed' else 'pending' end,
        send_after = now() + make_interval(mins => 5 * o.attempts),
        last_error = left(error, 1000)
    where o.id = email_id and o.status = 'sending';
  end if;
end;
$$;

revoke all on function public.claim_due_emails(text, integer) from public, anon, authenticated;
revoke all on function public.finish_email(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_due_emails(text, integer) to service_role;
grant execute on function public.finish_email(text, uuid, text, text) to service_role;

-- Every minute, wakes the send-emails function when emails are due. Does nothing until this project's
-- function address and secret are in the vault (email_sender_url, email_sender_secret).
create function private.wake_email_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_url');
  secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_secret');
begin
  if url is null or secret is null or (select s.mode from public.email_settings s) = 'off' then
    return;
  end if;
  if not exists (select 1 from public.email_outbox o
                 where (o.status = 'pending' and o.send_after <= now())
                    or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes')) then
    return;
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sender-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.wake_email_sender() from public, anon, authenticated;

select cron.schedule('send-emails', '* * * * *', 'select private.wake_email_sender()');
