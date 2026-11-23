-- Users get a last name next to their first name.
--
-- Until now the one name field often held the whole name ("Franck Tetard"), so existing names are split
-- at the first space: the first word stays the first name, the rest becomes the last name.
-- The app asks for both when adding a user; the database keeps them optional, because an account's
-- profile is created (by on_auth_user_created) before its names are set.

alter table public.profiles add column last_name text;

update public.profiles
set last_name = nullif(btrim(substr(btrim(first_name), strpos(btrim(first_name), ' ') + 1)), ''),
    first_name = split_part(btrim(first_name), ' ', 1)
where last_name is null and strpos(btrim(first_name), ' ') > 0;

-- Admins change it on the Users page, as they do the first name.
grant update (last_name) on public.profiles to authenticated;

-- Emails to admins show their whole name in the Email log.
create or replace function private.queue_order_request_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_email('order_request', null, new.id, p.id, null,
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, null)
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> '';
  return null;
end;
$$;

create or replace function private.queue_athlete_note_emails()
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
  select kind, new.id, p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         lower(btrim(p.email)), now()
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> '' and p.id is distinct from auth.uid()
  on conflict do nothing;
  return null;
end;
$$;

-- Note emails say who wrote the note by their whole name.
create or replace function private.note_email_details(note_id uuid, recipient_id uuid)
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
    'written_by', coalesce(nullif(btrim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), ''), au.email),
    'written_at', n.created_at,
    'first_name', (select p.first_name from public.profiles p where p.id = note_email_details.recipient_id))
  from public.notes n
  join public.athletes a on a.id = n.athlete_id
  left join public.profiles au on au.id = n.created_by
  where n.id = note_email_details.note_id;
$$;

create or replace function public.submit_quote_request(first_name text, last_name text, organization_name text, email text, phone text, country text, message text, website text default null)
returns void
language plpgsql
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

  insert into public.email_outbox (kind, lead_id, recipient_id, recipient_name, recipient_email, send_after)
  select 'quote_request', lead, p.id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         lower(btrim(p.email)), now()
  from public.profiles p
  where p.role = 'admin' and coalesce(btrim(p.email), '') <> ''
  on conflict do nothing;
end;
$$;
