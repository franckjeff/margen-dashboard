-- Factory users see the orders assigned to their factory, read-only. An admin links each
-- factory account to its factory on the Users page (profiles.factory_id).
alter table public.profiles add column factory_id uuid references public.factories(id) on delete set null;

create index profiles_factory_id_idx on public.profiles (factory_id);

-- The "Admins can change roles" policy still limits which rows can be updated to admins.
grant update (factory_id) on public.profiles to authenticated;

-- The signed-in user's factory, or null unless they have the factory role and are linked to one.
create function private.my_factory()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select factory_id from public.profiles
  where id = (select auth.uid()) and role = 'factory';
$$;

revoke execute on function private.my_factory() from public, anon;
grant execute on function private.my_factory() to authenticated;

-- Read-only: factory users have no insert, update or delete policies, so only admins can change data.
create policy "Factory users read their factory" on public.factories
  for select to authenticated using (id = (select private.my_factory()));

create policy "Factory users read their factory's orders" on public.orders
  for select to authenticated using (factory_id = (select private.my_factory()));

create policy "Factory users read their factory's order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.factory_id = (select private.my_factory()))
  );

-- Only the items on their factory's orders, so the item names show on those orders.
create policy "Factory users read the items on their orders" on public.items
  for select to authenticated using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.item_id = items.id and o.factory_id = (select private.my_factory())
    )
  );
