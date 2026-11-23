-- More email controls for admins on the Email Admin and Logs page:
--   - each admin chooses which admin emails they get (order requests, quote requests, athlete notes);
--   - the sender address and the wait before order emails can be changed there.
-- And sample emails now take their made-up details from the templates (supabase/functions/send-emails/templates.ts),
-- so the database only supplies the greeting's first name.

-- The admin emails each admin chose not to get.
alter table public.profiles add column muted_email_kinds text[] not null default '{}';

-- The kinds of email sent to admins, which each admin can choose.
create function private.admin_email_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['order_request', 'quote_request', 'athlete_note_added', 'athlete_note_edited'];
$$;

-- Before an email is queued: a kind that's turned off is logged as cancelled, and an admin email the
-- admin chose not to get isn't queued at all. Samples always go out.
create or replace function private.skip_turned_off_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sample then
    return new;
  end if;
  if new.recipient_id is not null
     and new.kind = any (coalesce((select p.muted_email_kinds from public.profiles p where p.id = new.recipient_id), '{}')) then
    return null;
  end if;
  if new.status = 'pending' and new.kind = any (coalesce((select s.disabled_kinds from public.email_settings s), '{}')) then
    new.status := 'cancelled';
    new.last_error := 'Not sent: these emails are turned off.';
  end if;
  return new;
end;
$$;

-- Chooses whether an admin gets one kind of admin email. Choosing not to also cancels those still waiting for them.
create function public.set_admin_email(user_id uuid, kind text, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can choose who gets admin emails.' using errcode = '42501';
  end if;
  if not set_admin_email.kind = any (private.admin_email_kinds()) then
    raise exception 'There''s no admin email called %.', set_admin_email.kind;
  end if;
  if not exists (select 1 from public.profiles p where p.id = set_admin_email.user_id and p.role = 'admin') then
    raise exception 'Only admins get admin emails.';
  end if;

  update public.profiles p
  set muted_email_kinds = case when enabled then array_remove(p.muted_email_kinds, set_admin_email.kind)
                               else array_append(array_remove(p.muted_email_kinds, set_admin_email.kind), set_admin_email.kind) end
  where p.id = set_admin_email.user_id;

  if not enabled then
    update public.email_outbox o
    set status = 'cancelled', last_error = 'Not sent: they chose not to get these emails.'
    where o.recipient_id = set_admin_email.user_id and o.kind = set_admin_email.kind and o.status = 'pending' and not o.sample;
  end if;
end;
$$;

-- Changes the sender ("Name <address>" or just an address, on a domain verified in Resend) and how many
-- minutes order emails wait (0 to 60). New emails use the new wait; waiting ones keep theirs.
create function public.set_email_sender(from_address text, delay_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender text := btrim(from_address);
begin
  if not private.is_admin() then
    raise exception 'Only admins can change the sender.' using errcode = '42501';
  end if;
  if sender is null or length(sender) > 200
     or sender !~ '^([^<>@]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$' then
    raise exception 'Enter the sender as Name <address@domain> or just address@domain.';
  end if;
  if delay_minutes is null or delay_minutes < 0 or delay_minutes > 60 then
    raise exception 'The wait must be between 0 and 60 minutes.';
  end if;
  update public.email_settings s
  set from_address = sender, delay_minutes = set_email_sender.delay_minutes
  where s.id;
end;
$$;

-- Samples: only the greeting's first name comes from the database.
create or replace function private.sample_email_details(kind text, recipient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('first_name', (select p.first_name from public.profiles p where p.id = sample_email_details.recipient_id));
$$;

revoke all on function private.admin_email_kinds() from public, anon, authenticated;
revoke all on function public.set_admin_email(uuid, text, boolean) from public, anon;
revoke all on function public.set_email_sender(text, integer) from public, anon;
grant execute on function public.set_admin_email(uuid, text, boolean) to authenticated;
grant execute on function public.set_email_sender(text, integer) to authenticated;
