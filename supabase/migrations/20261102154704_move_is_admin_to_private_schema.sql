-- The "private" schema is not exposed through the API, so is_admin() can't be called as /rpc/is_admin.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

drop policy "Users can read their own profile" on public.profiles;
drop policy "Admins can read all profiles" on public.profiles;
create policy "Users read their own profile; admins read all" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));

drop policy "Admins have full access to organizations" on public.organizations;
drop policy "Admins have full access to contacts" on public.contacts;
drop policy "Admins have full access to organization_contacts" on public.organization_contacts;
create policy "Admins have full access to organizations" on public.organizations
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins have full access to contacts" on public.contacts
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins have full access to organization_contacts" on public.organization_contacts
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop function public.is_admin();
