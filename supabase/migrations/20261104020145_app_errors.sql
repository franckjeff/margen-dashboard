-- App errors: what went wrong in someone's browser (a page that crashed, a failed database call,
-- a background error), so admins see problems without waiting to be told. Admins read them on
-- the Dashboard. Everyone, signed in or not, can only add errors, through log_app_error() below.

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crash', 'database', 'background')),
  message text not null,
  -- The stack trace or the database error code, for whoever fixes it.
  detail text,
  -- The page it happened on, e.g. #/customs/<id>.
  page text,
  user_agent text,
  -- Who saw it, filled in by the database from the sign-in rather than trusted from the browser.
  user_id uuid,
  user_email text,
  user_role text,
  -- The same error on the same page for the same person is counted, not stored again.
  count integer not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index app_errors_last_seen_at_idx on public.app_errors (last_seen_at desc);
create index app_errors_created_at_idx on public.app_errors (created_at);

alter table public.app_errors enable row level security;

create policy "Admins can read app errors" on public.app_errors
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can delete app errors" on public.app_errors
  for delete to authenticated using ((select private.is_admin()));

-- Records an error from the browser. Anyone may call it, including the public Order Entry page.
-- It never fails: too many reports are quietly dropped, so a broken page can't flood the table.
create function public.log_app_error(kind text, message text, detail text, page text, user_agent text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_kind text := case when kind in ('crash', 'database', 'background') then kind else 'background' end;
  clean_message text := left(coalesce(nullif(btrim(message), ''), 'Unknown error'), 1000);
  clean_page text := nullif(left(btrim(page), 500), '');
begin
  -- Errors older than 90 days are cleared as new ones arrive.
  delete from public.app_errors e where e.last_seen_at < now() - interval '90 days';

  update public.app_errors e
  set count = e.count + 1, last_seen_at = now()
  where e.kind = clean_kind
    and e.message = clean_message
    and e.page is not distinct from clean_page
    and e.user_id is not distinct from me
    and e.last_seen_at > now() - interval '1 day';
  if found then
    return;
  end if;

  -- Limits against floods: per person (or for everyone not signed in), and in total.
  if (select count(*) from public.app_errors e where e.user_id is not distinct from me and e.created_at > now() - interval '1 hour') >= 50 then
    return;
  end if;
  if (select count(*) from public.app_errors e where e.created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.app_errors (kind, message, detail, page, user_agent, user_id, user_email, user_role)
  values (
    clean_kind,
    clean_message,
    nullif(left(btrim(detail), 5000), ''),
    clean_page,
    nullif(left(btrim(user_agent), 300), ''),
    me,
    auth.jwt() ->> 'email',
    (select p.role from public.profiles p where p.id = me)
  );
end;
$$;

revoke all on function public.log_app_error(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text, text) to anon, authenticated;
