-- When each user last signed in, for the Users page. auth.users isn't reachable through the API,
-- so this function reads just that one column from it, and only for admins (others get no rows).
create function public.user_last_sign_ins()
returns table (id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where (select private.is_admin());
$$;

revoke all on function public.user_last_sign_ins() from public, anon;
grant execute on function public.user_last_sign_ins() to authenticated;
