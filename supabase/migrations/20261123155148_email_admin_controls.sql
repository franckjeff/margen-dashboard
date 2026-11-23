-- Controls for admins on the Email log page: pause all sending, turn each kind of email on or off,
-- and send themselves a sample of any kind.
--
-- Admins still can't change email_settings directly; they change these two settings through the
-- functions below, which check they're an admin. The mode, sender and links stay SQL-only.

alter table public.email_settings
  add column paused boolean not null default false,
  add column disabled_kinds text[] not null default '{}';

-- A sample email: made-up details, sent to the admin who asked for it.
alter table public.email_outbox add column sample boolean not null default false;

-- The kinds of email, as in email_outbox_kind_check.
create function private.email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited'];
$$;

-- An email of a kind that's turned off is still logged, as cancelled, so the log shows what wasn't sent.
create function private.skip_turned_off_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.sample and new.status = 'pending'
     and new.kind = any (coalesce((select s.disabled_kinds from public.email_settings s), '{}')) then
    new.status := 'cancelled';
    new.last_error := 'Not sent: these emails are turned off.';
  end if;
  return new;
end;
$$;

create trigger email_outbox_skip_turned_off
  before insert on public.email_outbox
  for each row execute function private.skip_turned_off_emails();

-- Pauses or resumes all sending. While paused, emails keep queuing and go out on resume.
create function public.set_email_sending_paused(paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can pause sending.' using errcode = '42501';
  end if;
  update public.email_settings s set paused = set_email_sending_paused.paused where s.id;
end;
$$;

-- Turns one kind of email on or off. Turning it off also cancels the ones of that kind still waiting.
create function public.set_email_kind_enabled(kind text, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can turn emails on or off.' using errcode = '42501';
  end if;
  if not set_email_kind_enabled.kind = any (private.email_kinds()) then
    raise exception 'There''s no kind of email called %.', set_email_kind_enabled.kind;
  end if;

  update public.email_settings s
  set disabled_kinds = case when enabled then array_remove(s.disabled_kinds, set_email_kind_enabled.kind)
                            else array_append(array_remove(s.disabled_kinds, set_email_kind_enabled.kind), set_email_kind_enabled.kind) end
  where s.id;

  if not enabled then
    update public.email_outbox o
    set status = 'cancelled', last_error = 'Not sent: these emails were turned off.'
    where o.kind = set_email_kind_enabled.kind and o.status = 'pending' and not o.sample;
  end if;
end;
$$;

-- Sends the admin who asks a sample of one kind of email, to their own address. Returns that address.
create function public.send_sample_email(kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if not private.is_admin() then
    raise exception 'Only admins can send sample emails.' using errcode = '42501';
  end if;
  if not send_sample_email.kind = any (private.email_kinds()) then
    raise exception 'There''s no kind of email called %.', send_sample_email.kind;
  end if;
  select * into me from public.profiles p where p.id = auth.uid();
  if coalesce(btrim(me.email), '') = '' then
    raise exception 'Your account has no email address to send the sample to.';
  end if;

  insert into public.email_outbox (kind, sample, recipient_id, recipient_name, recipient_email, send_after)
  values (send_sample_email.kind, true, me.id, nullif(btrim(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, '')), ''),
          lower(btrim(me.email)), now());
  return lower(btrim(me.email));
end;
$$;

-- What a sample email shows: made-up details, and the recipient's own first name.
create function private.sample_email_details(kind text, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when kind in ('order_assigned', 'order_shipped') then jsonb_build_object(
      'margen_order_id', 'SAMPLE-001',
      'factory_order_id', 'F-1001',
      'order_status', 'accepted',
      'pieces', 48,
      'estimated_ship_date', current_date + 14,
      'actual_ship_date', current_date,
      'shipping_method', 'DHL Express',
      'tracking_number', 'https://www.dhl.com/track?id=SAMPLE001',
      'factory_name', 'Sample Factory',
      'organization_name', 'Sample Rowing Club')
    when kind in ('order_request', 'quote_request') then jsonb_build_object(
      'organization_name', 'Sample Rowing Club',
      'contact_name', 'Alex Sample',
      'email', 'alex@example.com',
      'phone', '+33 6 00 00 00 00',
      'country', 'France',
      'pieces', 24,
      'notes', 'This is a sample email. Nothing was ordered or requested.')
    else jsonb_build_object(
      'athlete_name', 'Sam Sample',
      'body', 'This is a sample email. No note was added or edited.',
      'written_by', 'Alex Sample')
  end || jsonb_build_object('first_name', (select p.first_name from public.profiles p where p.id = sample_email_details.recipient_id));
$$;

revoke all on function private.email_kinds() from public, anon, authenticated;
revoke all on function private.skip_turned_off_emails() from public, anon, authenticated;
revoke all on function private.sample_email_details(text, uuid) from public, anon, authenticated;
revoke all on function public.set_email_sending_paused(boolean) from public, anon;
revoke all on function public.set_email_kind_enabled(text, boolean) from public, anon;
revoke all on function public.send_sample_email(text) from public, anon;
grant execute on function public.set_email_sending_paused(boolean) to authenticated;
grant execute on function public.set_email_kind_enabled(text, boolean) to authenticated;
grant execute on function public.send_sample_email(text) to authenticated;

-- While paused, the scheduled job doesn't call the sender at all.
create or replace function private.wake_email_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_url');
  secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'email_sender_secret');
begin
  if url is null or secret is null or (select s.mode = 'off' or s.paused from public.email_settings s) then
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

-- The sender gets nothing while paused, and made-up details for samples.
create or replace function public.claim_due_emails(secret text, batch integer default 20)
returns jsonb
language plpgsql
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

  update public.email_outbox o set status = 'pending'
  where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes';

  select * into settings from public.email_settings;
  if settings.mode = 'off' or settings.paused then
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
           case when c.sample then private.sample_email_details(c.kind, c.recipient_id)
                when c.lead_id is not null then private.lead_email_details(c.lead_id, c.recipient_id)
                when c.note_id is not null then private.note_email_details(c.note_id, c.recipient_id)
                else private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id) end)), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;
