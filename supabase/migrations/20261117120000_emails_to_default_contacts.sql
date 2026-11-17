-- Emails to factories and clients go to their default contact, not to user accounts: many clients
-- and factory people never sign in. Contacts get an email address, factories link to contacts the
-- way organizations do (one default each), and factory and client users manage their own contacts.

alter table public.contacts add column email text
  check (email is null or (length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- Factory contacts: like organization_contacts, at most one default per factory.
create table public.factory_contacts (
  factory_id uuid not null references public.factories(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (factory_id, contact_id)
);

create index factory_contacts_contact_id_idx on public.factory_contacts (contact_id);
create unique index factory_contacts_one_default on public.factory_contacts (factory_id) where is_default;

alter table public.factory_contacts enable row level security;

create policy "Admins have full access to factory_contacts" on public.factory_contacts
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Making a contact the default takes the flag away from the factory's previous default.
create function private.switch_default_factory_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default and not old.is_default then
    update public.factory_contacts
      set is_default = false
      where factory_id = new.factory_id
        and contact_id <> new.contact_id
        and is_default;
  end if;
  return new;
end;
$$;

create trigger switch_default_factory_contact
  before update of is_default on public.factory_contacts
  for each row execute function private.switch_default_factory_contact();

-- When a factory is left with exactly one contact and no default, that contact becomes the default.
create function private.ensure_default_factory_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f uuid := coalesce(new.factory_id, old.factory_id);
begin
  -- Skip while the factory itself is being deleted (its links are removed by cascade).
  if not exists (select 1 from public.factories where id = f) then
    return null;
  end if;
  if (select count(*) from public.factory_contacts where factory_id = f) = 1
     and not exists (select 1 from public.factory_contacts where factory_id = f and is_default) then
    update public.factory_contacts set is_default = true where factory_id = f;
  end if;
  return null;
end;
$$;

create trigger ensure_default_factory_contact
  after insert or delete on public.factory_contacts
  for each row execute function private.ensure_default_factory_contact();

revoke all on function private.switch_default_factory_contact() from public, anon, authenticated;
revoke all on function private.ensure_default_factory_contact() from public, anon, authenticated;

-- Each factory's contact name becomes a contact, linked as its default (the first word is the first name).
do $$
declare
  f record;
  made uuid;
begin
  for f in select id, btrim(contact_name) as name from public.factories where coalesce(btrim(contact_name), '') <> '' loop
    insert into public.contacts (first_name, last_name)
    values (split_part(f.name, ' ', 1), btrim(substr(f.name, length(split_part(f.name, ' ', 1)) + 1)))
    returning id into made;
    insert into public.factory_contacts (factory_id, contact_id, is_default) values (f.id, made, true);
  end loop;
end;
$$;

alter table public.factories drop column contact_name;

-- Factory and client users manage the contacts of their own factory or organization: they see them,
-- change them, choose the default and unlink them. They add contacts with add_my_contact() below.
-- Links can only have their default flag changed, so nobody can attach someone else's contact.
create function private.is_my_contact(contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.factory_contacts fc where fc.contact_id = contact and fc.factory_id = private.my_factory())
      or exists (select 1 from public.organization_contacts oc where oc.contact_id = contact and oc.organization_id = private.my_organization());
$$;

revoke execute on function private.is_my_contact(uuid) from public, anon;
grant execute on function private.is_my_contact(uuid) to authenticated;

create policy "Factory and client users read their contacts" on public.contacts
  for select to authenticated using ((select private.is_my_contact(id)));
create policy "Factory and client users change their contacts" on public.contacts
  for update to authenticated using ((select private.is_my_contact(id))) with check ((select private.is_my_contact(id)));

create policy "Factory users read their factory's contact links" on public.factory_contacts
  for select to authenticated using (factory_id = (select private.my_factory()));
create policy "Factory users choose their factory's default contact" on public.factory_contacts
  for update to authenticated using (factory_id = (select private.my_factory())) with check (factory_id = (select private.my_factory()));
create policy "Factory users unlink their factory's contacts" on public.factory_contacts
  for delete to authenticated using (factory_id = (select private.my_factory()));

create policy "Client users read their organization's contact links" on public.organization_contacts
  for select to authenticated using (organization_id = (select private.my_organization()));
create policy "Client users choose their organization's default contact" on public.organization_contacts
  for update to authenticated using (organization_id = (select private.my_organization())) with check (organization_id = (select private.my_organization()));
create policy "Client users unlink their organization's contacts" on public.organization_contacts
  for delete to authenticated using (organization_id = (select private.my_organization()));

revoke update on public.factory_contacts, public.organization_contacts from anon, authenticated;
grant update (is_default) on public.factory_contacts, public.organization_contacts to authenticated;

-- Adds a contact to the signed-in factory or client user's own factory or organization.
-- It becomes the default when it's the first one.
create function public.add_my_contact(first_name text, last_name text, email text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f uuid := private.my_factory();
  o uuid := private.my_organization();
  made uuid;
begin
  if f is null and o is null then
    raise exception 'Only factory and client accounts linked to a factory or organization can add contacts here.' using errcode = '42501';
  end if;
  if coalesce(btrim(first_name), '') = '' or coalesce(btrim(last_name), '') = '' then
    raise exception 'The contact needs a first and last name.';
  end if;
  insert into public.contacts (first_name, last_name, email)
  values (btrim(first_name), btrim(last_name), nullif(lower(btrim(email)), ''))
  returning id into made;
  if f is not null then
    insert into public.factory_contacts (factory_id, contact_id) values (f, made);
  else
    insert into public.organization_contacts (organization_id, contact_id) values (o, made);
  end if;
  return made;
end;
$$;

revoke all on function public.add_my_contact(text, text, text) from public, anon;
grant execute on function public.add_my_contact(text, text, text) to authenticated;

-- The outbox now records the contact an email is for, and events with nobody to email
-- (no default contact, or one without an email address) as 'skipped', with the reason.
alter table public.email_outbox add column contact_id uuid references public.contacts(id) on delete set null;
alter table public.email_outbox add column recipient_name text;
alter table public.email_outbox alter column recipient_email drop not null;
alter table public.email_outbox drop constraint email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled', 'skipped'));
alter table public.email_outbox add constraint email_outbox_has_address check (status = 'skipped' or recipient_email is not null);
create index email_outbox_contact_id_idx on public.email_outbox (contact_id);

-- Queues one email, or records that there was nobody to email.
create function private.queue_email(kind text, order_id uuid, order_request_id uuid, recipient_id uuid,
                                    contact_id uuid, recipient_name text, recipient_email text, nobody_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (kind, order_id, order_request_id, recipient_id, contact_id, recipient_name,
                                   recipient_email, status, last_error, send_after)
  values (queue_email.kind, queue_email.order_id, queue_email.order_request_id, queue_email.recipient_id, queue_email.contact_id,
          queue_email.recipient_name, nullif(lower(btrim(queue_email.recipient_email)), ''),
          case when coalesce(btrim(queue_email.recipient_email), '') = '' then 'skipped' else 'pending' end,
          case when coalesce(btrim(queue_email.recipient_email), '') = '' then nobody_reason end,
          now() + make_interval(mins => case when queue_email.kind = 'order_request' then 0
                                             else (select s.delay_minutes from public.email_settings s) end))
  on conflict do nothing;
$$;

-- Queues an email to the default contact of a factory or organization.
create function private.queue_default_contact_email(kind text, order_id uuid, factory_id uuid, organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_name text := coalesce((select f.name from public.factories f where f.id = queue_default_contact_email.factory_id),
                              (select o.name from public.organizations o where o.id = queue_default_contact_email.organization_id));
  c public.contacts;
begin
  if queue_default_contact_email.factory_id is not null then
    select x.* into c from public.contacts x join public.factory_contacts l on l.contact_id = x.id
    where l.factory_id = queue_default_contact_email.factory_id and l.is_default;
  else
    select x.* into c from public.contacts x join public.organization_contacts l on l.contact_id = x.id
    where l.organization_id = queue_default_contact_email.organization_id and l.is_default;
  end if;
  perform private.queue_email(kind, order_id, null, null, c.id, nullif(btrim(c.first_name || ' ' || c.last_name), ''), c.email,
    case when c.id is null then owner_name || ' has no default contact.'
         else c.first_name || ' ' || c.last_name || ', the default contact of ' || owner_name || ', has no email address.' end);
end;
$$;

-- Orders: tell the factory's default contact when an order is assigned to it, and the client's when it ships.
create or replace function private.queue_order_emails()
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
    perform private.queue_default_contact_email('order_assigned', new.id, new.factory_id, null);
  elsif tg_op = 'UPDATE' and new.factory_id is null and old.factory_id is not null then
    perform private.cancel_waiting_emails('order_assigned', new.id);
  end if;

  if new.production_status = 'shipped' and new.organization_id is not null
     and (tg_op = 'INSERT' or old.production_status is distinct from 'shipped') then
    perform private.queue_default_contact_email('order_shipped', new.id, null, new.organization_id);
  elsif tg_op = 'UPDATE' and old.production_status = 'shipped' and new.production_status is distinct from 'shipped' then
    perform private.cancel_waiting_emails('order_shipped', new.id);
  end if;
  return null;
end;
$$;

-- Order requests: tell every admin straight away.
create or replace function private.queue_order_request_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_email('order_request', null, new.id, p.id, null, p.first_name, p.email, null)
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> '';
  return null;
end;
$$;

drop function private.queue_emails(text, uuid, uuid, uuid[]);

revoke all on function private.queue_email(text, uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.queue_default_contact_email(text, uuid, uuid, uuid) from public, anon, authenticated;

-- The greeting uses the contact's first name, or the admin's.
drop function private.email_details(uuid, uuid, uuid);

create function private.email_details(order_id uuid, order_request_id uuid, recipient_id uuid, contact_id uuid)
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
  end || jsonb_build_object('first_name', coalesce(
    (select c.first_name from public.contacts c where c.id = email_details.contact_id),
    (select p.first_name from public.profiles p where p.id = email_details.recipient_id)));
$$;

revoke all on function private.email_details(uuid, uuid, uuid, uuid) from public, anon, authenticated;

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
           private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id))), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;
