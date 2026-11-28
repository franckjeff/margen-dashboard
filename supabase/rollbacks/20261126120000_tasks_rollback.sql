-- Undoes supabase/migrations/20261126120000_tasks.sql: removes Tasks completely.
--
-- Deletes every task, its notes and its emails, then puts the notes, the email outbox and the email
-- functions back exactly as they were before. Run it as one transaction on the database that has Tasks
-- (MARGEN TEST first); it also forgets the migration, so it can be applied again later.

begin;

-- Emails
delete from public.email_outbox where kind = 'task_assigned' or task_id is not null;
update public.profiles set muted_email_kinds = array_remove(muted_email_kinds, 'task_assigned')
where 'task_assigned' = any (muted_email_kinds);
update public.email_settings set disabled_kinds = array_remove(disabled_kinds, 'task_assigned')
where 'task_assigned' = any (disabled_kinds);

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

create or replace function private.email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added',
               'order_note_from_factory', 'order_note_from_admin'];
$$;

create or replace function private.admin_email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_request', 'quote_request', 'athlete_note_added', 'order_note_from_factory'];
$$;

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added',
                  'order_note_from_factory', 'order_note_from_admin'));

drop index public.email_outbox_one_waiting;
alter table public.email_outbox drop column task_id;
create unique index email_outbox_one_waiting on public.email_outbox
  (kind, coalesce(order_id, order_request_id, lead_id, note_id), recipient_email)
  where status in ('pending', 'sending');

-- Notes
drop policy "Factory users read their tasks' notes" on public.notes;
drop policy "Factory users add notes to their tasks" on public.notes;
drop policy "Factory users delete their own task notes" on public.notes;
alter table public.notes drop constraint notes_one_subject;
delete from public.notes where task_id is not null;
alter table public.notes drop column task_id;
alter table public.notes add constraint notes_one_subject
  check (num_nonnulls(contact_id, athlete_id, factory_id, organization_id, order_id, lead_id) = 1);

-- Tasks
drop table public.tasks;
drop function private.check_task();
drop function private.queue_task_emails();
drop function private.task_email_details(uuid, uuid);

delete from supabase_migrations.schema_migrations where version = '20261126120000';

commit;
