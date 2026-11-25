-- New users get a temporary password (emailed to them by the create-user function) and must choose their
-- own when they first sign in. The create-user function sets the flag with the secret key; the app asks for a
-- new password while it's set, and clears it with password_changed() once the new password is saved.

alter table public.profiles add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True while the user still has the temporary password they were given; the app makes them choose their own.';

-- Called by the app right after the signed-in user saves a new password. It only ever clears their own flag.
create or replace function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false
  where id = (select auth.uid()) and must_change_password;
$$;

revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;
