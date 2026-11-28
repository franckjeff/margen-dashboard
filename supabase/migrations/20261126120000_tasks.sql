-- Tasks: a to-do for one person, set by an admin. Phase 1 of the Tasks feature.
--
-- An admin creates a task and assigns it to themselves, another admin or a factory user (someone who can sign in).
-- A task can point at an order. Comments are notes on the task (notes.task_id), shown as a timeline.
-- Admins see and change every task. A factory user sees only the tasks assigned to them: they can change
-- the status and add notes, nothing else. Clients see no tasks.
-- Assigning a task to someone else emails them ("task_assigned"), within a minute.
--
-- To undo all of it: supabase/rollbacks/20261126120000_tasks_rollback.sql.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date,
  assignee_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Kept on the task: factory users can't read admins' profiles.
  created_by_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assignee_id_idx on public.tasks (assignee_id, status);
create index tasks_order_id_idx on public.tasks (order_id);
create index tasks_created_by_idx on public.tasks (created_by);

alter table public.tasks enable row level security;

create policy "Admins have full access to tasks" on public.tasks
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- my_factory() is null for anyone who isn't an active factory user.
create policy "Factory users read their tasks" on public.tasks
  for select to authenticated
  using (assignee_id = (select auth.uid()) and (select private.my_factory()) is not null);

create policy "Factory users update their tasks" on public.tasks
  for update to authenticated
  using (assignee_id = (select auth.uid()) and (select private.my_factory()) is not null)
  with check (assignee_id = (select auth.uid()));

-- On every save: who created it, when it was finished, and that it goes to someone who can sign in.
-- Anyone but an admin can change only the status.
create function private.check_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author public.profiles;
  assignee public.profiles;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    select * into author from public.profiles p where p.id = new.created_by;
    new.created_by_name := coalesce(nullif(btrim(coalesce(author.first_name, '') || ' ' || coalesce(author.last_name, '')), ''), author.email);
    new.created_at := now();
  else
    if auth.uid() is not null and not private.is_admin()
       and (new.title, new.description, new.due_date, new.assignee_id, new.order_id, new.created_by, new.created_by_name, new.created_at)
           is distinct from
           (old.title, old.description, old.due_date, old.assignee_id, old.order_id, old.created_by, old.created_by_name, old.created_at) then
      raise exception 'You can only change the status of your tasks.' using errcode = '42501';
    end if;
  end if;

  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    select * into assignee from public.profiles p where p.id = new.assignee_id;
    if assignee.id is null or assignee.role not in ('admin', 'factory') or assignee.disabled_at is not null then
      raise exception 'A task can only be assigned to an admin or a factory user whose account is active.';
    end if;
  end if;

  new.completed_at := case when new.status <> 'done' then null
                           when tg_op = 'UPDATE' and old.status = 'done' then old.completed_at
                           else now() end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_check
  before insert or update on public.tasks
  for each row execute function private.check_task();

-- Comments on a task are notes.
alter table public.notes add column task_id uuid references public.tasks (id) on delete cascade;
create index notes_task_id_idx on public.notes (task_id);

alter table public.notes drop constraint notes_one_subject;
alter table public.notes add constraint notes_one_subject
  check (num_nonnulls(contact_id, athlete_id, factory_id, organization_id, order_id, lead_id, task_id) = 1);

create policy "Factory users read their tasks' notes" on public.notes
  for select to authenticated
  using (task_id in (select t.id from public.tasks t where t.assignee_id = (select auth.uid()))
         and (select private.my_factory()) is not null);

create policy "Factory users add notes to their tasks" on public.notes
  for insert to authenticated
  with check (created_by = (select auth.uid())
              and task_id in (select t.id from public.tasks t where t.assignee_id = (select auth.uid()))
              and (select private.my_factory()) is not null);

create policy "Factory users delete their own task notes" on public.notes
  for delete to authenticated
  using (created_by = (select auth.uid())
         and task_id in (select t.id from public.tasks t where t.assignee_id = (select auth.uid()))
         and (select private.my_factory()) is not null);

-- The "task assigned" email.
alter table public.email_outbox add column task_id uuid references public.tasks (id) on delete cascade;
create index email_outbox_task_id_idx on public.email_outbox (task_id);

drop index public.email_outbox_one_waiting;
create unique index email_outbox_one_waiting on public.email_outbox
  (kind, coalesce(order_id, order_request_id, lead_id, note_id, task_id), recipient_email)
  where status in ('pending', 'sending');

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added',
                  'order_note_from_factory', 'order_note_from_admin', 'task_assigned'));

create or replace function private.email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added',
               'order_note_from_factory', 'order_note_from_admin', 'task_assigned'];
$$;

-- Each admin can choose whether they get task emails too.
create or replace function private.admin_email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_request', 'quote_request', 'athlete_note_added', 'order_note_from_factory', 'task_assigned'];
$$;

-- Emails the person a task is given to, when it's created or reassigned, unless they gave it to themselves.
create function private.queue_task_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is null or new.assignee_id is not distinct from auth.uid()
     or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then
    return null;
  end if;
  insert into public.email_outbox (kind, task_id, recipient_id, recipient_name, recipient_email, status, last_error, send_after)
  select 'task_assigned', new.id, p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         nullif(lower(btrim(p.email)), ''),
         case when coalesce(btrim(p.email), '') = '' then 'skipped' else 'pending' end,
         case when coalesce(btrim(p.email), '') = '' then 'They have no email address.' end,
         now()
  from public.profiles p
  where p.id = new.assignee_id
  on conflict do nothing;
  return null;
end;
$$;

create trigger tasks_queue_emails
  after insert or update of assignee_id on public.tasks
  for each row execute function private.queue_task_emails();

-- What a task email shows. The order's MARGEN ID only: factories see no client details.
create function private.task_email_details(task_id uuid, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'task_id', t.id,
    'task_title', t.title,
    'body', t.description,
    'due_date', t.due_date,
    'margen_order_id', o.margen_order_id,
    'written_by', t.created_by_name,
    'first_name', (select p.first_name from public.profiles p where p.id = task_email_details.recipient_id))
  from public.tasks t
  left join public.orders o on o.id = t.order_id
  where t.id = task_email_details.task_id;
$$;

revoke all on function private.check_task() from public, anon, authenticated;
revoke all on function private.queue_task_emails() from public, anon, authenticated;
revoke all on function private.task_email_details(uuid, uuid) from public, anon, authenticated;

-- The sender gets the details of task emails too.
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
                when c.task_id is not null then private.task_email_details(c.task_id, c.recipient_id)
                when c.kind in ('order_note_from_factory', 'order_note_from_admin')
                  then private.order_note_email_details(c.note_id, c.recipient_id, c.contact_id)
                when c.note_id is not null then private.note_email_details(c.note_id, c.recipient_id)
                else private.email_details(c.order_id, c.order_request_id, c.recipient_id, c.contact_id) end)), '[]'::jsonb)
  into emails from claimed c;

  return jsonb_build_object('settings', to_jsonb(settings), 'emails', emails);
end;
$$;
