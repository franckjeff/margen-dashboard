-- Deleting an organization (Organizations page, Delete beside Add organization):
--   * refused while it has orders that are neither cancelled nor archived, or client accounts linked to it;
--   * its cancelled and archived orders are kept, with the organization's name saved on them
--     (orders.organization_name), so they still show and can be searched by it.
-- Its contact links and notes go with it, as before.

alter table public.orders add column organization_name text;

comment on column public.orders.organization_name is
  'Name of the order''s organization, saved when that organization was deleted (organization_id is then null).';

create or replace function private.check_organization_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_orders int;
  accounts int;
begin
  select count(*) into open_orders
  from public.orders
  where organization_id = old.id and archived_at is null and order_status <> 'cancelled';
  if open_orders > 0 then
    raise exception '% has % that %n''t cancelled or archived, so it can''t be deleted.',
      old.name,
      case when open_orders = 1 then '1 order' else open_orders || ' orders' end,
      case when open_orders = 1 then 'is' else 'are' end
      using errcode = '23503';
  end if;

  select count(*) into accounts from public.profiles where organization_id = old.id;
  if accounts > 0 then
    raise exception '% has % linked to it. Link % to another organization, or delete %, first.',
      old.name,
      case when accounts = 1 then '1 client account' else accounts || ' client accounts' end,
      case when accounts = 1 then 'it' else 'them' end,
      case when accounts = 1 then 'it' else 'them' end
      using errcode = '23503';
  end if;

  -- The orders left are cancelled or archived: they keep the name. Done here, while the organization still
  -- exists, so the order history records the change from its name.
  update public.orders
  set organization_name = old.name, organization_id = null
  where organization_id = old.id;
  return old;
end;
$$;

create trigger organizations_check_delete
before delete on public.organizations
for each row execute function private.check_organization_delete();
