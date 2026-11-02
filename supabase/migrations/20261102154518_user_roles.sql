-- One profile per account, holding its access level.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'client' check (role in ('admin', 'factory', 'client')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Every new account gets a profile with the default (client) role.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for accounts that already exist; the current owner account becomes admin.
insert into public.profiles (id, email, role)
select id, email, case when id = 'cb62f489-710d-4e4d-98d4-803c7729e07d' then 'admin' else 'client' end
from auth.users;

-- Security definer so policies can check the caller's role without recursing through profiles RLS.
create function public.is_admin()
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

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Users can read their own profile; admins can read all. Nobody can change roles through the API.
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Admins can read all profiles" on public.profiles
  for select to authenticated using ((select public.is_admin()));

-- Organizations, contacts and their links become admin-only.
drop policy "Authenticated users can read organizations" on public.organizations;
drop policy "Authenticated users can insert organizations" on public.organizations;
drop policy "Authenticated users can update organizations" on public.organizations;
drop policy "Authenticated users can delete organizations" on public.organizations;
drop policy "Authenticated users can read contacts" on public.contacts;
drop policy "Authenticated users can insert contacts" on public.contacts;
drop policy "Authenticated users can update contacts" on public.contacts;
drop policy "Authenticated users can delete contacts" on public.contacts;
drop policy "Authenticated users can read organization_contacts" on public.organization_contacts;
drop policy "Authenticated users can insert organization_contacts" on public.organization_contacts;
drop policy "Authenticated users can update organization_contacts" on public.organization_contacts;
drop policy "Authenticated users can delete organization_contacts" on public.organization_contacts;

create policy "Admins have full access to organizations" on public.organizations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins have full access to contacts" on public.contacts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins have full access to organization_contacts" on public.organization_contacts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
