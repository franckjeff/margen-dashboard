-- The admin Dashboard's numbers in one small reply, instead of loading whole tables to count them.
-- Runs as the caller (security invoker), so the usual row rules still apply; and refuses anyone but admins.
create function public.dashboard_counts()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Only admins can see the Dashboard counts.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orders', (select count(*) from public.orders),
    -- Orders in each status now, leaving out archived ones, as on the Orders page.
    'order_statuses', coalesce((
      select jsonb_object_agg(order_status, n)
      from (select order_status, count(*) as n from public.orders where archived_at is null group by order_status) s
    ), '{}'::jsonb),
    'new_order_requests', (select count(*) from public.order_requests where status = 'new'),
    -- Must match OPEN_LEAD_STATUSES in src/lib/constants.ts.
    'open_leads', (select count(*) from public.leads where status in ('new', 'contacted', 'qualified')),
    'athletes', (select count(*) from public.athletes),
    'organizations', (select count(*) from public.organizations),
    'contacts', (select count(*) from public.contacts),
    'links', (select count(*) from public.organization_contacts),
    'contacts_without_organization', (
      select count(*) from public.contacts c
      where not exists (select 1 from public.organization_contacts oc where oc.contact_id = c.id)
    )
  );
end;
$$;

revoke execute on function public.dashboard_counts() from public, anon;
grant execute on function public.dashboard_counts() to authenticated;
