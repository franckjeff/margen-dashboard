-- Through the API, only the role column can ever be changed.
revoke update on public.profiles from authenticated, anon;
grant update (role) on public.profiles to authenticated;

create policy "Admins can change roles" on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Never leave the project without an admin.
create function private.keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'There must always be at least one admin.';
  end if;
  return new;
end;
$$;

create trigger keep_one_admin
  before update of role on public.profiles
  for each row execute function private.keep_one_admin();
