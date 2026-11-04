-- Client users see their organization's orders, read-only. An admin links each client account
-- to its organization on the Users page (profiles.organization_id).
alter table public.profiles add column organization_id uuid references public.organizations(id) on delete set null;

create index profiles_organization_id_idx on public.profiles (organization_id);

-- The "Admins can change roles" policy still limits which rows can be updated to admins.
grant update (organization_id) on public.profiles to authenticated;

-- The signed-in user's organization, or null unless they have the client role and are linked to one.
create function private.my_organization()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles
  where id = (select auth.uid()) and role = 'client';
$$;

revoke execute on function private.my_organization() from public, anon;
grant execute on function private.my_organization() to authenticated;

-- Read-only: client users have no insert, update or delete policies, so only admins can change data.
create policy "Client users read their organization" on public.organizations
  for select to authenticated using (id = (select private.my_organization()));

create policy "Client users read their organization's orders" on public.orders
  for select to authenticated using (organization_id = (select private.my_organization()));

create policy "Client users read their organization's order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.organization_id = (select private.my_organization()))
  );

-- Only the items on their organization's orders, so the item names show on those orders.
create policy "Client users read the items on their orders" on public.items
  for select to authenticated using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.item_id = items.id and o.organization_id = (select private.my_organization())
    )
  );
