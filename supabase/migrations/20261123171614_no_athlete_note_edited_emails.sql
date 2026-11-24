-- Athlete notes can't be edited in the app, so the "athlete note edited" email goes: only a new athlete
-- note emails the admins. (The live database never logged one.)

delete from public.email_outbox where kind = 'athlete_note_edited';
update public.profiles set muted_email_kinds = array_remove(muted_email_kinds, 'athlete_note_edited')
where 'athlete_note_edited' = any (muted_email_kinds);
update public.email_settings set disabled_kinds = array_remove(disabled_kinds, 'athlete_note_edited')
where 'athlete_note_edited' = any (disabled_kinds);

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('order_assigned', 'order_shipped', 'order_request', 'quote_request', 'athlete_note_added',
                  'order_note_from_factory', 'order_note_from_admin'));

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

-- A new note about an athlete emails every admin with an email address, except the one who wrote it.
create or replace function private.queue_athlete_note_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is null then
    return null;
  end if;
  insert into public.email_outbox (kind, note_id, recipient_id, recipient_name, recipient_email, send_after)
  select 'athlete_note_added', new.id, p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         lower(btrim(p.email)), now()
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> '' and p.id is distinct from auth.uid()
  on conflict do nothing;
  return null;
end;
$$;

drop trigger notes_queue_athlete_emails on public.notes;
create trigger notes_queue_athlete_emails
  after insert on public.notes
  for each row execute function private.queue_athlete_note_emails();
