-- Order history keeps the name of whoever made each change, like notes do (notes.author_name), so the
-- history still says who did what after their account is deleted (changed_by then becomes null).

alter table public.order_events add column changed_by_name text;

comment on column public.order_events.changed_by_name is
  'Name (or email) of the user who made the change, saved when it was made. Null for changes from outside the app.';

create or replace function private.stamp_order_event_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.changed_by is not null then
    select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    into new.changed_by_name
    from public.profiles p
    where p.id = new.changed_by;
  end if;
  return new;
end;
$$;

create trigger stamp_order_event_author
before insert on public.order_events
for each row execute function private.stamp_order_event_author();

-- Existing history: the names the users have now.
update public.order_events e
set changed_by_name = coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
from public.profiles p
where p.id = e.changed_by;
