-- Emails the admins when a note about an athlete is added or edited.
--
-- One email per admin with an email address, except the admin who made the change. They go out within
-- a minute (no waiting time), and show the note as it is when the email is sent. Deleting the note
-- before then drops its waiting emails.

alter table public.email_outbox
  add column note_id uuid references public.notes (id) on delete cascade;
create index email_outbox_note_id_idx on public.email_outbox (note_id);

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited'));

-- At most one waiting email of a kind per person about the same thing, now notes too.
drop index public.email_outbox_one_waiting;
create unique index email_outbox_one_waiting on public.email_outbox
  (kind, coalesce(order_id, order_request_id, lead_id, note_id), recipient_email)
  where status in ('pending', 'sending');

-- What an athlete note email shows.
create function private.note_email_details(note_id uuid, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'athlete_id', a.id,
    'athlete_name', btrim(a.first_name || ' ' || a.last_name),
    'body', n.body,
    'written_by', coalesce(nullif(btrim(au.first_name), ''), au.email),
    'written_at', n.created_at,
    'first_name', (select p.first_name from public.profiles p where p.id = note_email_details.recipient_id))
  from public.notes n
  join public.athletes a on a.id = n.athlete_id
  left join public.profiles au on au.id = n.created_by
  where n.id = note_email_details.note_id;
$$;

create function private.queue_athlete_note_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := case when tg_op = 'INSERT' then 'athlete_note_added' else 'athlete_note_edited' end;
begin
  if new.athlete_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.body is not distinct from old.body and new.athlete_id is not distinct from old.athlete_id then
      return null;
    end if;
    -- Still waiting to tell the admins it was added: that email will show the edited note.
    if exists (select 1 from public.email_outbox o
               where o.note_id = new.id and o.kind = 'athlete_note_added' and o.status in ('pending', 'sending')) then
      return null;
    end if;
  end if;

  insert into public.email_outbox (kind, note_id, recipient_id, recipient_name, recipient_email, send_after)
  select kind, new.id, p.id, p.first_name, lower(btrim(p.email)), now()
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> '' and p.id is distinct from auth.uid()
  on conflict do nothing;
  return null;
end;
$$;

create trigger notes_queue_athlete_emails
  after insert or update of body, athlete_id on public.notes
  for each row execute function private.queue_athlete_note_emails();

revoke all on function private.note_email_details(uuid, uuid) from public, anon, authenticated;
revoke all on function private.queue_athlete_note_emails() from public, anon, authenticated;

-- The sender gets the details of note emails too.
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
                when c.note_id is not null then private.note_email_details(c.note_id, c.recipient_id)
                else private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id) end)), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;
