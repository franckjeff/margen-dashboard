-- Notes on orders: internal notes shared between MARGEN's admins and the order's factory.
--
-- Admins and the factory the order is assigned to read them and add them; clients never see them.
-- A factory user can delete their own notes; admins can delete any.
-- A note from the factory emails the admins; a note from an admin emails the factory's default contact.
-- Both go out within a minute.

alter table public.notes add column order_id uuid references public.orders (id) on delete cascade;
create index notes_order_id_idx on public.notes (order_id);

alter table public.notes drop constraint notes_one_subject;
alter table public.notes add constraint notes_one_subject
  check (num_nonnulls(contact_id, athlete_id, factory_id, organization_id, order_id) = 1);

-- Who wrote a note, kept on the note itself: factory users can't read admins' profiles, and an order
-- note shows whether it came from the factory or from MARGEN.
alter table public.notes
  add column author_name text,
  add column from_factory boolean not null default false;

update public.notes n
set author_name = coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
from public.profiles p
where p.id = n.created_by;

-- The author is always whoever is signed in, so nobody can write a note in someone else's name.
create function private.stamp_note_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author public.profiles;
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  select * into author from public.profiles p where p.id = new.created_by;
  new.author_name := coalesce(nullif(btrim(coalesce(author.first_name, '') || ' ' || coalesce(author.last_name, '')), ''), author.email);
  new.from_factory := coalesce(author.role = 'factory', false);
  return new;
end;
$$;

create trigger notes_stamp_author
  before insert on public.notes
  for each row execute function private.stamp_note_author();

-- Factory users: the notes on their factory's orders.
create policy "Factory users read their orders' notes" on public.notes
  for select to authenticated
  using (order_id in (select o.id from public.orders o where o.factory_id = (select private.my_factory())));

create policy "Factory users add notes to their orders" on public.notes
  for insert to authenticated
  with check (created_by = (select auth.uid())
              and order_id in (select o.id from public.orders o where o.factory_id = (select private.my_factory())));

create policy "Factory users delete their own order notes" on public.notes
  for delete to authenticated
  using (created_by = (select auth.uid())
         and order_id in (select o.id from public.orders o where o.factory_id = (select private.my_factory())));

-- Two new kinds of email.
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited',
                  'order_note_from_factory', 'order_note_from_admin'));

create or replace function private.email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited',
               'order_note_from_factory', 'order_note_from_admin'];
$$;

-- Each admin can choose whether they get factory notes too.
create or replace function private.admin_email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited', 'order_note_from_factory'];
$$;

-- Queues the emails of a new order note: to the admins when the factory wrote it, otherwise to the
-- factory's default contact (logged as "Nobody to email" when there's none, or it has no email address).
create function private.queue_order_note_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  factory public.factories;
  c public.contacts;
begin
  if new.order_id is null then
    return null;
  end if;

  if new.from_factory then
    insert into public.email_outbox (kind, note_id, recipient_id, recipient_name, recipient_email, send_after)
    select 'order_note_from_factory', new.id, p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           lower(btrim(p.email)), now()
    from public.profiles p
    where p.role = 'admin' and coalesce(btrim(p.email), '') <> ''
    on conflict do nothing;
    return null;
  end if;

  select f.* into factory from public.factories f join public.orders o on o.factory_id = f.id where o.id = new.order_id;
  if factory.id is null then
    return null;
  end if;
  select x.* into c from public.contacts x join public.factory_contacts l on l.contact_id = x.id
  where l.factory_id = factory.id and l.is_default;

  insert into public.email_outbox (kind, note_id, contact_id, recipient_name, recipient_email, status, last_error, send_after)
  values ('order_note_from_admin', new.id, c.id, nullif(btrim(c.first_name || ' ' || c.last_name), ''),
          nullif(lower(btrim(c.email)), ''),
          case when coalesce(btrim(c.email), '') = '' then 'skipped' else 'pending' end,
          case when c.id is null then factory.name || ' has no default contact.'
               when coalesce(btrim(c.email), '') = '' then c.first_name || ' ' || c.last_name || ', the default contact of ' || factory.name || ', has no email address.' end,
          now())
  on conflict do nothing;
  return null;
end;
$$;

create trigger notes_queue_order_emails
  after insert on public.notes
  for each row execute function private.queue_order_note_emails();

-- What an order note email shows. No client details: the factory never sees them.
create function private.order_note_email_details(note_id uuid, recipient_id uuid, contact_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'margen_order_id', o.margen_order_id,
    'factory_order_id', o.factory_order_id,
    'factory_name', f.name,
    'body', n.body,
    'written_by', n.author_name,
    'first_name', coalesce(
      (select c.first_name from public.contacts c where c.id = order_note_email_details.contact_id),
      (select p.first_name from public.profiles p where p.id = order_note_email_details.recipient_id)))
  from public.notes n
  join public.orders o on o.id = n.order_id
  left join public.factories f on f.id = o.factory_id
  where n.id = order_note_email_details.note_id;
$$;

revoke all on function private.stamp_note_author() from public, anon, authenticated;
revoke all on function private.queue_order_note_emails() from public, anon, authenticated;
revoke all on function private.order_note_email_details(uuid, uuid, uuid) from public, anon, authenticated;

-- The sender gets the details of order note emails too.
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
                when c.kind in ('order_note_from_factory', 'order_note_from_admin')
                  then private.order_note_email_details(c.note_id, c.recipient_id, c.contact_id)
                when c.note_id is not null then private.note_email_details(c.note_id, c.recipient_id)
                else private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id) end)), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;
