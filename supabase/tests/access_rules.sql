-- Access-rule tests: checks what each kind of user can and can't see or change, table by table.
--
-- How to run: paste this whole file into the SQL editor of the MARGEN TEST project and run it
-- (it's also safe on MARGEN PROD, the live project). It always ends with
-- an error, on purpose, so that nothing it does is kept: the test users and records it creates,
-- and every change it tries, are all undone. Read the result in the error message:
--   "ACCESS TESTS PASSED: 243 checks"  or  "ACCESS TESTS FAILED: 2 of 243 checks" followed by each failure.
--
-- Each check runs one query as one user, then undoes it, so checks don't affect each other.
-- Expected results:
--   a number  the query returns that count (queries that change rows count the rows changed)
--   denied    the database refuses with a permission error (code 42501)
--   error     the database refuses with any error (e.g. a message from one of our functions)
--   ok        no error
--
-- When you add a table or change who can do what, add checks here.

begin;

-- Test users, one per kind. They exist only while this file runs.
create function pg_temp.user_id(who text) returns uuid language sql immutable as $$
  select case who
    when 'admin' then '0000ace5-0000-4000-8000-000000000001'
    when 'factory' then '0000ace5-0000-4000-8000-000000000002'
    when 'factory_b' then '0000ace5-0000-4000-8000-000000000003'
    when 'client' then '0000ace5-0000-4000-8000-000000000004'
    when 'client_b' then '0000ace5-0000-4000-8000-000000000006'
  end::uuid
$$;

create temp table results (n serial, test text, who text, expected text, got text, passed boolean);

create function pg_temp.check(test text, who text, query text, expected text) returns void language plpgsql as $$
declare
  me uuid := pg_temp.user_id(who);
  got text;
begin
  begin
    if who = 'anon' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated', 'email', who || '@access-test.invalid')::text, true);
      set local role authenticated;
    end if;
    if expected ~ '^\d+$' then
      execute query into got;
    else
      execute query;
      got := 'ok';
    end if;
    -- Undo whatever the query changed.
    raise exception using errcode = 'P0099', message = coalesce(got, 'null');
  exception
    when sqlstate 'P0099' then got := sqlerrm;
    when others then got := 'error ' || sqlstate || ': ' || sqlerrm;
  end;
  insert into pg_temp.results (test, who, expected, got, passed)
  values (test, who, expected, got, case expected
    when 'denied' then got like 'error 42501:%'
    when 'error' then got like 'error %'
    else got = expected
  end);
end;
$$;

-- Test data. 0000ace5-… ids can't clash with real records.
insert into auth.users (id, email, aud, role)
select pg_temp.user_id(w), w || '@access-test.invalid', 'authenticated', 'authenticated'
from unnest(array['admin', 'factory', 'factory_b', 'client', 'client_b']) w;

insert into public.factories (id, name) values
  ('0000ace5-0000-4000-8000-0000000f0001', 'Access test factory A'),
  ('0000ace5-0000-4000-8000-0000000f0002', 'Access test factory B');

update public.profiles set role = 'admin' where id = pg_temp.user_id('admin');
update public.profiles set role = 'factory', factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = pg_temp.user_id('factory');
update public.profiles set role = 'factory', factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = pg_temp.user_id('factory_b');
update public.profiles set role = 'client' where id = pg_temp.user_id('client_b');

insert into public.items (id, item_code, name) values
  ('0000ace5-0000-4000-8000-0000000e0001', 'ACCESS-TEST-X', 'Access test item X'),
  ('0000ace5-0000-4000-8000-0000000e0002', 'ACCESS-TEST-Y', 'Access test item Y');
insert into public.organizations (id, name) values ('0000ace5-0000-4000-8000-0000000b0001', 'Access test organization');
-- The client user is linked to this organization; client_b isn't linked to any.
update public.profiles set role = 'client', organization_id = '0000ace5-0000-4000-8000-0000000b0001' where id = pg_temp.user_id('client');
insert into public.contacts (id, first_name, last_name, email) values ('0000ace5-0000-4000-8000-0000000b0002', 'Access', 'Test', 'org-contact@access-test.invalid');
-- The organization's only contact, so it becomes its default contact.
insert into public.organization_contacts (organization_id, contact_id) values ('0000ace5-0000-4000-8000-0000000b0001', '0000ace5-0000-4000-8000-0000000b0002');
-- Factory A has a default contact with an email and a second contact; factory B's only contact has no email.
insert into public.contacts (id, first_name, last_name, email) values
  ('0000ace5-0000-4000-8000-0000000f0011', 'Factory', 'A', 'factory-a@access-test.invalid'),
  ('0000ace5-0000-4000-8000-0000000f0013', 'Factory', 'A second', null),
  ('0000ace5-0000-4000-8000-0000000f0012', 'Factory', 'B', null);
insert into public.factory_contacts (factory_id, contact_id, is_default) values
  ('0000ace5-0000-4000-8000-0000000f0001', '0000ace5-0000-4000-8000-0000000f0011', true),
  ('0000ace5-0000-4000-8000-0000000f0001', '0000ace5-0000-4000-8000-0000000f0013', false),
  ('0000ace5-0000-4000-8000-0000000f0002', '0000ace5-0000-4000-8000-0000000f0012', false);
insert into public.athletes (id, first_name, last_name) values ('0000ace5-0000-4000-8000-0000000b0003', 'Access', 'Test');
insert into public.leads (id, first_name, last_name) values ('0000ace5-0000-4000-8000-0000000b0004', 'Access', 'Test');
insert into public.notes (id, organization_id, body) values ('0000ace5-0000-4000-8000-0000000b0005', '0000ace5-0000-4000-8000-0000000b0001', 'Access test note');
-- Order A is factory A's and the test organization's (with item X), order B is factory B's (with item Y).
insert into public.orders (id, margen_order_id, factory_id, organization_id) values
  ('0000ace5-0000-4000-8000-0000000d0001', 'ACCESS_TEST_A', '0000ace5-0000-4000-8000-0000000f0001', '0000ace5-0000-4000-8000-0000000b0001'),
  ('0000ace5-0000-4000-8000-0000000d0002', 'ACCESS_TEST_B', '0000ace5-0000-4000-8000-0000000f0002', null);
insert into public.order_items (id, order_id, item_id, size, quantity) values
  ('0000ace5-0000-4000-8000-0000000c0001', '0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000e0001', 'M', 1),
  ('0000ace5-0000-4000-8000-0000000c0002', '0000ace5-0000-4000-8000-0000000d0002', '0000ace5-0000-4000-8000-0000000e0002', 'M', 1);
insert into public.order_requests (id, organization_name, contact_name, email) values
  ('0000ace5-0000-4000-8000-0000000b0006', 'Access test club', 'Test', 'access-test@example.invalid');
insert into public.order_request_lines (request_id, item_id, size, quantity) values
  ('0000ace5-0000-4000-8000-0000000b0006', '0000ace5-0000-4000-8000-0000000e0001', 'L', 3);
insert into public.scrapbooks (user_id, body) values
  (pg_temp.user_id('client'), 'Client ideas'),
  (pg_temp.user_id('client_b'), 'Other client ideas');
insert into public.app_errors (kind, message) values ('background', 'Access test error');
-- Order A ships, so its organization's default contact has an email waiting. Factory A's default contact
-- has one for order A; order B's is skipped (factory B's contact has no email); the admin has one for
-- the order request. All were queued above.
update public.orders set production_status = 'shipped' where id = '0000ace5-0000-4000-8000-0000000d0001';

-- Changes that cancel or queue emails, run as the signed-in user, counting what the outbox then holds.
create function pg_temp.undo_shipping() returns int language plpgsql as $f$
begin
  update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0001';
  return (select count(*) from public.email_outbox where order_id = '0000ace5-0000-4000-8000-0000000d0001'
          and kind = 'order_shipped' and status = 'cancelled');
end $f$;
create function pg_temp.reassign_order() returns int language plpgsql as $f$
begin
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = '0000ace5-0000-4000-8000-0000000d0001';
  return (select count(*) from public.email_outbox where order_id = '0000ace5-0000-4000-8000-0000000d0001' and kind = 'order_assigned'
          and ((contact_id = '0000ace5-0000-4000-8000-0000000f0011' and status = 'cancelled')
            or (contact_id = '0000ace5-0000-4000-8000-0000000f0012' and status = 'skipped')));
end $f$;
-- Ships order B for an organization with no contacts: nobody to email.
create function pg_temp.ship_to_org_without_contacts() returns int language plpgsql as $f$
begin
  insert into public.organizations (id, name) values ('0000ace5-0000-4000-8000-0000000b0010', 'Access test organization without contacts');
  update public.orders set organization_id = '0000ace5-0000-4000-8000-0000000b0010', production_status = 'shipped'
  where id = '0000ace5-0000-4000-8000-0000000d0002';
  return (select count(*) from public.email_outbox where order_id = '0000ace5-0000-4000-8000-0000000d0002' and kind = 'order_shipped'
          and status = 'skipped' and last_error like '%has no default contact.');
end $f$;
-- Adds a contact as the signed-in user: 1 when it's linked to their factory, 10 to their organization.
create function pg_temp.add_contact() returns int language plpgsql as $f$
declare
  made uuid := public.add_my_contact(' New ', 'Person', 'New@Example.invalid');
begin
  return (select count(*) from public.factory_contacts where contact_id = made)
       + 10 * (select count(*) from public.organization_contacts where contact_id = made);
end $f$;
-- Makes factory A's second contact the default: how many defaults factory A then has.
create function pg_temp.switch_factory_default() returns int language plpgsql as $f$
begin
  update public.factory_contacts set is_default = true where contact_id = '0000ace5-0000-4000-8000-0000000f0013';
  return (select count(*) from public.factory_contacts where factory_id = '0000ace5-0000-4000-8000-0000000f0001' and is_default and contact_id = '0000ace5-0000-4000-8000-0000000f0013')
       + (select count(*) from public.factory_contacts where factory_id = '0000ace5-0000-4000-8000-0000000f0001' and is_default and contact_id <> '0000ace5-0000-4000-8000-0000000f0013');
end $f$;

-- Admin-only tables: everyone but admins sees nothing and can't add, change or delete.
-- (The linked client also sees its own organization: checked further down.)
do $$
declare
  t text;
  who text;
begin
  foreach t in array array['organizations', 'contacts', 'organization_contacts', 'athletes', 'leads', 'notes',
                           'order_requests', 'order_request_lines', 'order_events', 'app_errors'] loop
    perform pg_temp.check(t || ': admin sees them', 'admin', format('select (count(*) > 0)::int from public.%I', t), '1');
    foreach who in array array['anon', 'client', 'client_b', 'factory'] loop
      continue when t = 'organizations' and who = 'client';
      -- Factory and client users see their own contacts: checked further down.
      continue when t = 'contacts' and who in ('client', 'factory');
      continue when t = 'organization_contacts' and who = 'client';
      perform pg_temp.check(t || ': sees nothing', who, format('select count(*) from public.%I', t), '0');
      perform pg_temp.check(t || ': can''t delete', who, format('with x as (delete from public.%I returning 1) select count(*) from x', t), '0');
    end loop;
  end loop;
end $$;

-- Adding to admin-only tables.
select pg_temp.check('organizations: admin can add', 'admin', $q$insert into public.organizations (name) values ('New')$q$, 'ok');
select pg_temp.check('organizations: can''t add', 'client', $q$insert into public.organizations (name) values ('New')$q$, 'denied');
select pg_temp.check('organizations: can''t add', 'anon', $q$insert into public.organizations (name) values ('New')$q$, 'denied');
select pg_temp.check('contacts: can''t add', 'client_b', $q$insert into public.contacts (first_name, last_name) values ('A', 'B')$q$, 'denied');
select pg_temp.check('athletes: can''t add', 'factory', $q$insert into public.athletes (first_name, last_name) values ('A', 'B')$q$, 'denied');
select pg_temp.check('leads: can''t add', 'anon', $q$insert into public.leads (first_name, last_name) values ('A', 'B')$q$, 'denied');
select pg_temp.check('leads: can''t change', 'client', $q$with x as (update public.leads set status = 'lost' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('leads: admin can change', 'admin', $q$with x as (update public.leads set status = 'lost' where id = '0000ace5-0000-4000-8000-0000000b0004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('notes: can''t add', 'factory', $q$insert into public.notes (factory_id, body) values ('0000ace5-0000-4000-8000-0000000f0001', 'x')$q$, 'denied');
select pg_temp.check('order_requests: can''t add directly', 'anon', $q$insert into public.order_requests (organization_name, contact_name, email) values ('A', 'B', 'a@b.co')$q$, 'denied');
select pg_temp.check('order_events: can''t add', 'admin', $q$insert into public.order_events (order_id, margen_order_id, action) values ('0000ace5-0000-4000-8000-0000000d0001', 'X', 'updated')$q$, 'denied');
select pg_temp.check('order_events: admin can''t change the history', 'admin', $q$with x as (update public.order_events set action = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('order_events: admin can''t delete the history', 'admin', $q$with x as (delete from public.order_events returning 1) select count(*) from x$q$, '0');
select pg_temp.check('app_errors: can''t add directly', 'client', $q$insert into public.app_errors (kind, message) values ('crash', 'x')$q$, 'denied');
select pg_temp.check('app_errors: admin can clear', 'admin', $q$with x as (delete from public.app_errors where message = 'Access test error' returning 1) select count(*) from x$q$, '1');

-- Orders: admins see all; a factory sees and updates only its own, and only some fields.
select pg_temp.check('orders: admin sees both test orders', 'admin', $q$select count(*) from public.orders where margen_order_id like 'ACCESS_TEST_%'$q$, '2');
select pg_temp.check('orders: factory sees only its own', 'factory', $q$select count(*) from public.orders where factory_id is distinct from '0000ace5-0000-4000-8000-0000000f0001'$q$, '0');
select pg_temp.check('orders: factory sees its order', 'factory', $q$select count(*) from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, '1');
select pg_temp.check('orders: other factory doesn''t see it', 'factory_b', $q$select count(*) from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, '0');
select pg_temp.check('orders: unlinked client sees nothing', 'client_b', $q$select count(*) from public.orders$q$, '0');
select pg_temp.check('orders: sees nothing', 'anon', $q$select count(*) from public.orders$q$, '0');
select pg_temp.check('orders: factory updates production status', 'factory', $q$with x as (update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: factory updates shipping details', 'factory', $q$with x as (update public.orders set tracking_number = 'T1', shipping_method = 'Air', estimated_ship_date = current_date, actual_ship_date = current_date where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: factory can''t update another factory''s order', 'factory', $q$with x as (update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0002' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: factory can''t change the order status', 'factory', $q$update public.orders set order_status = 'closed' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t change the Margen order ID', 'factory', $q$update public.orders set margen_order_id = 'X' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t change the organization', 'factory', $q$update public.orders set organization_id = null where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t hand the order to another factory', 'factory', $q$update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t add', 'factory', $q$insert into public.orders (margen_order_id, factory_id) values ('ACCESS_TEST_NEW', '0000ace5-0000-4000-8000-0000000f0001')$q$, 'denied');
select pg_temp.check('orders: factory can''t delete', 'factory', $q$with x as (delete from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: can''t add', 'client', $q$insert into public.orders (margen_order_id) values ('ACCESS_TEST_NEW')$q$, 'denied');
select pg_temp.check('orders: can''t change', 'client', $q$with x as (update public.orders set order_status = 'closed' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: admin can change the status', 'admin', $q$with x as (update public.orders set order_status = 'closed' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');

-- Order lines: a factory sees its own orders' lines, read only.
select pg_temp.check('order_items: factory sees only its orders'' lines', 'factory', $q$select count(*) from public.order_items where id in ('0000ace5-0000-4000-8000-0000000c0001', '0000ace5-0000-4000-8000-0000000c0002')$q$, '1');
select pg_temp.check('order_items: factory sees no other lines', 'factory', $q$select count(*) from public.order_items oi where not exists (select 1 from public.orders o where o.id = oi.order_id)$q$, '0');
select pg_temp.check('order_items: factory can''t change quantities', 'factory', $q$with x as (update public.order_items set quantity = 99 returning 1) select count(*) from x$q$, '0');
select pg_temp.check('order_items: factory can''t add lines', 'factory', $q$insert into public.order_items (order_id, item_id, size, quantity) values ('0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000e0001', 'S', 1)$q$, 'denied');
select pg_temp.check('order_items: factory can''t remove lines', 'factory', $q$with x as (delete from public.order_items returning 1) select count(*) from x$q$, '0');
select pg_temp.check('order_items: unlinked client sees nothing', 'client_b', $q$select count(*) from public.order_items$q$, '0');
select pg_temp.check('order_items: sees nothing', 'anon', $q$select count(*) from public.order_items$q$, '0');
select pg_temp.check('order_items: admin can add lines', 'admin', $q$insert into public.order_items (order_id, item_id, size, quantity) values ('0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000e0001', 'S', 1)$q$, 'ok');

-- Items: a factory sees only the items on its orders; only admins change them.
select pg_temp.check('items: factory sees items on its orders', 'factory', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0001'$q$, '1');
select pg_temp.check('items: factory doesn''t see other items', 'factory', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0002'$q$, '0');
select pg_temp.check('items: factory can''t change', 'factory', $q$with x as (update public.items set name = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('items: unlinked client sees nothing', 'client_b', $q$select count(*) from public.items$q$, '0');
select pg_temp.check('items: sees nothing', 'anon', $q$select count(*) from public.items$q$, '0');
select pg_temp.check('items: can''t add', 'client', $q$insert into public.items (item_code, name) values ('X', 'X')$q$, 'denied');
select pg_temp.check('items: admin can rename', 'admin', $q$with x as (update public.items set name = 'Renamed' where id = '0000ace5-0000-4000-8000-0000000e0001' returning 1) select count(*) from x$q$, '1');

-- Clients: a client user sees its organization and that organization's orders, lines and items, read only.
select pg_temp.check('organizations: client sees only its own', 'client', $q$select count(*) from public.organizations$q$, '1');
select pg_temp.check('organizations: client can''t rename its own', 'client', $q$with x as (update public.organizations set name = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: client sees only its organization''s', 'client', $q$select count(*) from public.orders where organization_id is distinct from '0000ace5-0000-4000-8000-0000000b0001'$q$, '0');
select pg_temp.check('orders: client sees its order', 'client', $q$select count(*) from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, '1');
select pg_temp.check('orders: client can''t change its order', 'client', $q$with x as (update public.orders set order_status = 'closed' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: client can''t delete its order', 'client', $q$with x as (delete from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('order_items: client sees only its orders'' lines', 'client', $q$select count(*) from public.order_items where id in ('0000ace5-0000-4000-8000-0000000c0001', '0000ace5-0000-4000-8000-0000000c0002')$q$, '1');
select pg_temp.check('order_items: client can''t change quantities', 'client', $q$with x as (update public.order_items set quantity = 99 returning 1) select count(*) from x$q$, '0');
select pg_temp.check('order_items: client can''t add lines', 'client', $q$insert into public.order_items (order_id, item_id, size, quantity) values ('0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000e0001', 'S', 1)$q$, 'denied');
select pg_temp.check('items: client sees items on its orders', 'client', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0001'$q$, '1');
select pg_temp.check('items: client doesn''t see other items', 'client', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0002'$q$, '0');
select pg_temp.check('order_events: client sees no order history', 'client', $q$select count(*) from public.order_events$q$, '0');

-- Factories: a factory user sees only their own factory, read only.
select pg_temp.check('factories: factory sees only its own', 'factory', $q$select count(*) from public.factories$q$, '1');
select pg_temp.check('factories: factory can''t change its details', 'factory', $q$with x as (update public.factories set name = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('factories: sees nothing', 'client', $q$select count(*) from public.factories$q$, '0');
select pg_temp.check('factories: sees nothing', 'anon', $q$select count(*) from public.factories$q$, '0');
select pg_temp.check('factories: can''t add', 'factory', $q$insert into public.factories (name) values ('x')$q$, 'denied');

-- Profiles: users see their own; only admins see everyone and change roles, factories and first names.
select pg_temp.check('profiles: sees only their own', 'client', $q$select count(*) from public.profiles$q$, '1');
select pg_temp.check('profiles: sees only their own', 'factory', $q$select count(*) from public.profiles$q$, '1');
select pg_temp.check('profiles: sees nothing', 'anon', $q$select count(*) from public.profiles$q$, '0');
select pg_temp.check('profiles: admin sees the test users', 'admin', $q$select count(*) from public.profiles where email like '%@access-test.invalid'$q$, '5');
select pg_temp.check('profiles: can''t make themselves admin', 'client', $q$with x as (update public.profiles set role = 'admin' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: factory can''t switch to another factory', 'factory', $q$with x as (update public.profiles set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: client can''t switch to another organization', 'client', $q$with x as (update public.profiles set organization_id = null where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: can''t change their first name', 'client', $q$with x as (update public.profiles set first_name = 'X' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: can''t change their email', 'admin', $q$update public.profiles set email = 'x@y.co' where id = auth.uid()$q$, 'denied');
select pg_temp.check('profiles: can''t add', 'client', $q$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@y.co')$q$, 'denied');
select pg_temp.check('profiles: admin can change a role', 'admin', $q$with x as (update public.profiles set role = 'factory' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('profiles: admin can set a first name', 'admin', $q$with x as (update public.profiles set first_name = 'Test' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('profiles: designer is no longer a level', 'admin', $q$update public.profiles set role = 'designer' where id = '0000ace5-0000-4000-8000-000000000004'$q$, 'error');

-- Scrapbooks: each user sees and changes only their own.
select pg_temp.check('scrapbooks: sees only their own', 'client', $q$select count(*) from public.scrapbooks$q$, '1');
select pg_temp.check('scrapbooks: sees only their own', 'client_b', $q$select count(*) from public.scrapbooks$q$, '1');
select pg_temp.check('scrapbooks: admin sees only their own too', 'admin', $q$select count(*) from public.scrapbooks where user_id <> auth.uid()$q$, '0');
select pg_temp.check('scrapbooks: can''t change someone else''s', 'client', $q$with x as (update public.scrapbooks set body = 'x' where user_id = '0000ace5-0000-4000-8000-000000000006' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('scrapbooks: can''t write in someone else''s name', 'admin', $q$insert into public.scrapbooks (user_id, body) values ('0000ace5-0000-4000-8000-000000000004', 'x')$q$, 'denied');
select pg_temp.check('scrapbooks: can write their own', 'factory', $q$insert into public.scrapbooks (user_id, body) values (auth.uid(), 'x')$q$, 'ok');
select pg_temp.check('scrapbooks: sees nothing', 'anon', $q$select count(*) from public.scrapbooks$q$, '0');

-- Note dismissals: each user hides notes only for themselves.
select pg_temp.check('note_dismissals: can hide a note for themselves', 'admin', $q$insert into public.note_dismissals (note_id) values ('0000ace5-0000-4000-8000-0000000b0005')$q$, 'ok');
select pg_temp.check('note_dismissals: can''t hide a note for someone else', 'admin', $q$insert into public.note_dismissals (note_id, user_id) values ('0000ace5-0000-4000-8000-0000000b0005', '0000ace5-0000-4000-8000-000000000004')$q$, 'denied');

-- Functions.
select pg_temp.check('order_entry_items: the public order page can list items', 'anon', $q$select (count(*) > 0)::int from public.order_entry_items()$q$, '1');
select pg_temp.check('submit_order_request: the public order page can send', 'anon',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'ok');
select pg_temp.check('submit_order_request: refuses unknown items', 'anon',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-000000000000", "size": "M", "quantity": 2}]', '')$q$, 'error');
select pg_temp.check('convert_order_request: the public can''t call it', 'anon', $q$select public.convert_order_request('0000ace5-0000-4000-8000-0000000b0006', 'ACCESS_TEST_C')$q$, 'denied');
select pg_temp.check('convert_order_request: non-admins are refused', 'client', $q$select public.convert_order_request('0000ace5-0000-4000-8000-0000000b0006', 'ACCESS_TEST_C')$q$, 'error');
select pg_temp.check('convert_order_request: factories are refused', 'factory', $q$select public.convert_order_request('0000ace5-0000-4000-8000-0000000b0006', 'ACCESS_TEST_C')$q$, 'error');
select pg_temp.check('convert_order_request: admin can convert', 'admin', $q$select public.convert_order_request('0000ace5-0000-4000-8000-0000000b0006', 'ACCESS_TEST_C')$q$, 'ok');
select pg_temp.check('user_last_sign_ins: non-admins get nothing', 'client', $q$select count(*) from public.user_last_sign_ins()$q$, '0');
select pg_temp.check('user_last_sign_ins: the public can''t call it', 'anon', $q$select count(*) from public.user_last_sign_ins()$q$, 'denied');
select pg_temp.check('user_last_sign_ins: admin sees users', 'admin', $q$select (count(*) > 0)::int from public.user_last_sign_ins()$q$, '1');
select pg_temp.check('log_app_error: the public can log an error', 'anon', $q$select public.log_app_error('crash', 'x', '', '#/order', '')$q$, 'ok');
select pg_temp.check('log_app_error: signed-in users can log an error', 'client_b', $q$select public.log_app_error('crash', 'x', '', '#/dashboard', '')$q$, 'ok');

-- Emails: the database queues them for the right people; only admins see them, and only cancel or retry them.
select pg_temp.check('email_outbox: assigned order emails its factory''s default contact', 'admin', $q$select count(*) from public.email_outbox where kind = 'order_assigned' and order_id = '0000ace5-0000-4000-8000-0000000d0001' and contact_id = '0000ace5-0000-4000-8000-0000000f0011' and recipient_email = 'factory-a@access-test.invalid' and status = 'pending'$q$, '1');
select pg_temp.check('email_outbox: a default contact without email is skipped', 'admin', $q$select count(*) from public.email_outbox where kind = 'order_assigned' and order_id = '0000ace5-0000-4000-8000-0000000d0002' and contact_id = '0000ace5-0000-4000-8000-0000000f0012' and status = 'skipped' and recipient_email is null and last_error like '%has no email address.'$q$, '1');
select pg_temp.check('email_outbox: only default contacts get order emails', 'admin', $q$select count(*) from public.email_outbox where order_id is not null and (contact_id = '0000ace5-0000-4000-8000-0000000f0013' or recipient_id is not null)$q$, '0');
select pg_temp.check('email_outbox: shipped order emails its organization''s default contact', 'admin', $q$select count(*) from public.email_outbox where kind = 'order_shipped' and order_id = '0000ace5-0000-4000-8000-0000000d0001' and contact_id = '0000ace5-0000-4000-8000-0000000b0002' and recipient_name = 'Access Test' and status = 'pending'$q$, '1');
select pg_temp.check('email_outbox: shipping to an organization without contacts is skipped', 'admin', $q$select pg_temp.ship_to_org_without_contacts()$q$, '1');
select pg_temp.check('email_outbox: order request emails admins', 'admin', $q$select count(*) from public.email_outbox where kind = 'order_request' and order_request_id = '0000ace5-0000-4000-8000-0000000b0006' and recipient_id = '0000ace5-0000-4000-8000-000000000001'$q$, '1');
select pg_temp.check('email_outbox: order request emails only admins', 'admin', $q$select count(*) from public.email_outbox o join public.profiles p on p.id = o.recipient_id where o.order_request_id = '0000ace5-0000-4000-8000-0000000b0006' and p.role <> 'admin'$q$, '0');
select pg_temp.check('email_outbox: undoing shipped cancels the waiting email', 'admin', $q$select pg_temp.undo_shipping()$q$, '1');
select pg_temp.check('email_outbox: reassigning swaps the factory email', 'admin', $q$select pg_temp.reassign_order()$q$, '2');
select pg_temp.check('email_outbox: admin can''t send a skipped email', 'admin', $q$update public.email_outbox set status = 'pending' where status = 'skipped'$q$, 'error');
select pg_temp.check('email_outbox: factory sees nothing', 'factory', $q$select count(*) from public.email_outbox$q$, '0');
select pg_temp.check('email_outbox: client sees nothing', 'client', $q$select count(*) from public.email_outbox$q$, '0');
select pg_temp.check('email_outbox: sees nothing', 'client_b', $q$select count(*) from public.email_outbox$q$, '0');
select pg_temp.check('email_outbox: sees nothing', 'anon', $q$select count(*) from public.email_outbox$q$, '0');
select pg_temp.check('email_outbox: admin can''t add directly', 'admin', $q$insert into public.email_outbox (kind, recipient_email) values ('order_request', 'x@y.co')$q$, 'denied');
select pg_temp.check('email_outbox: can''t add', 'anon', $q$insert into public.email_outbox (kind, recipient_email) values ('order_request', 'x@y.co')$q$, 'denied');
select pg_temp.check('email_outbox: admin can''t change the recipient', 'admin', $q$update public.email_outbox set recipient_email = 'x@y.co'$q$, 'denied');
select pg_temp.check('email_outbox: admin can''t delete', 'admin', $q$delete from public.email_outbox$q$, 'denied');
select pg_temp.check('email_outbox: admin can cancel', 'admin', $q$with x as (update public.email_outbox set status = 'cancelled' where contact_id = '0000ace5-0000-4000-8000-0000000f0011' returning 1) select (count(*) > 0)::int from x$q$, '1');
select pg_temp.check('email_outbox: factory can''t cancel', 'factory', $q$with x as (update public.email_outbox set status = 'cancelled' returning 1) select count(*) from x$q$, '0');

-- Contacts: factory and client users see and manage the contacts of their own factory or organization.
select pg_temp.check('contacts: factory sees its factory''s contacts', 'factory', $q$select count(*) from public.contacts$q$, '2');
select pg_temp.check('contacts: other factory sees only its own', 'factory_b', $q$select count(*) from public.contacts where id <> '0000ace5-0000-4000-8000-0000000f0012'$q$, '0');
select pg_temp.check('contacts: client sees its organization''s contacts', 'client', $q$select count(*) from public.contacts where id = '0000ace5-0000-4000-8000-0000000b0002'$q$, '1');
select pg_temp.check('contacts: client sees only its own', 'client', $q$select count(*) from public.contacts$q$, '1');
select pg_temp.check('contacts: unlinked client sees nothing', 'client_b', $q$select count(*) from public.contacts$q$, '0');
select pg_temp.check('contacts: factory changes its contact', 'factory', $q$with x as (update public.contacts set email = 'new@example.invalid' where id = '0000ace5-0000-4000-8000-0000000f0011' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('contacts: factory can''t change other contacts', 'factory', $q$with x as (update public.contacts set email = 'new@example.invalid' where id in ('0000ace5-0000-4000-8000-0000000b0002', '0000ace5-0000-4000-8000-0000000f0012') returning 1) select count(*) from x$q$, '0');
select pg_temp.check('contacts: client changes its contact', 'client', $q$with x as (update public.contacts set first_name = 'New' where id = '0000ace5-0000-4000-8000-0000000b0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('contacts: factory can''t delete contacts', 'factory', $q$with x as (delete from public.contacts returning 1) select count(*) from x$q$, '0');
select pg_temp.check('contacts: factory can''t add directly', 'factory', $q$insert into public.contacts (first_name, last_name) values ('A', 'B')$q$, 'denied');
select pg_temp.check('contacts: email must look like one', 'admin', $q$update public.contacts set email = 'not an email' where id = '0000ace5-0000-4000-8000-0000000b0002'$q$, 'error');
select pg_temp.check('add_my_contact: factory adds one to its factory', 'factory', $q$select pg_temp.add_contact()$q$, '1');
select pg_temp.check('add_my_contact: client adds one to its organization', 'client', $q$select pg_temp.add_contact()$q$, '10');
select pg_temp.check('add_my_contact: unlinked client is refused', 'client_b', $q$select public.add_my_contact('A', 'B')$q$, 'denied');
select pg_temp.check('add_my_contact: admin is refused (uses Contacts)', 'admin', $q$select public.add_my_contact('A', 'B')$q$, 'denied');
select pg_temp.check('add_my_contact: the public can''t call it', 'anon', $q$select public.add_my_contact('A', 'B')$q$, 'denied');
select pg_temp.check('add_my_contact: needs a name', 'factory', $q$select public.add_my_contact('', 'B')$q$, 'error');
select pg_temp.check('factory_contacts: admin sees them', 'admin', $q$select count(*) from public.factory_contacts where contact_id in ('0000ace5-0000-4000-8000-0000000f0011', '0000ace5-0000-4000-8000-0000000f0013', '0000ace5-0000-4000-8000-0000000f0012')$q$, '3');
select pg_temp.check('factory_contacts: factory sees its own', 'factory', $q$select count(*) from public.factory_contacts$q$, '2');
select pg_temp.check('factory_contacts: other factory sees only its own', 'factory_b', $q$select count(*) from public.factory_contacts where factory_id = '0000ace5-0000-4000-8000-0000000f0001'$q$, '0');
select pg_temp.check('factory_contacts: sees nothing', 'client', $q$select count(*) from public.factory_contacts$q$, '0');
select pg_temp.check('factory_contacts: sees nothing', 'client_b', $q$select count(*) from public.factory_contacts$q$, '0');
select pg_temp.check('factory_contacts: sees nothing', 'anon', $q$select count(*) from public.factory_contacts$q$, '0');
select pg_temp.check('factory_contacts: making a default replaces the old one', 'factory', $q$select pg_temp.switch_factory_default()$q$, '1');
select pg_temp.check('factory_contacts: other factory can''t change the default', 'factory_b', $q$with x as (update public.factory_contacts set is_default = true where contact_id = '0000ace5-0000-4000-8000-0000000f0013' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('factory_contacts: factory can''t move a link', 'factory', $q$update public.factory_contacts set contact_id = '0000ace5-0000-4000-8000-0000000b0002' where contact_id = '0000ace5-0000-4000-8000-0000000f0013'$q$, 'denied');
select pg_temp.check('factory_contacts: factory can''t link other contacts', 'factory', $q$insert into public.factory_contacts (factory_id, contact_id) values ('0000ace5-0000-4000-8000-0000000f0001', '0000ace5-0000-4000-8000-0000000b0002')$q$, 'denied');
select pg_temp.check('factory_contacts: factory unlinks its contact', 'factory', $q$with x as (delete from public.factory_contacts where contact_id = '0000ace5-0000-4000-8000-0000000f0013' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('factory_contacts: other factory can''t unlink', 'factory_b', $q$with x as (delete from public.factory_contacts where factory_id = '0000ace5-0000-4000-8000-0000000f0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('factory_contacts: client can''t unlink', 'client', $q$with x as (delete from public.factory_contacts returning 1) select count(*) from x$q$, '0');
select pg_temp.check('factory_contacts: admin links a contact', 'admin', $q$insert into public.factory_contacts (factory_id, contact_id) values ('0000ace5-0000-4000-8000-0000000f0001', '0000ace5-0000-4000-8000-0000000b0002')$q$, 'ok');
select pg_temp.check('organization_contacts: client sees its own', 'client', $q$select count(*) from public.organization_contacts$q$, '1');
select pg_temp.check('organization_contacts: client chooses the default', 'client', $q$with x as (update public.organization_contacts set is_default = true where contact_id = '0000ace5-0000-4000-8000-0000000b0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('organization_contacts: client can''t link other contacts', 'client', $q$insert into public.organization_contacts (organization_id, contact_id) values ('0000ace5-0000-4000-8000-0000000b0001', '0000ace5-0000-4000-8000-0000000f0011')$q$, 'denied');
select pg_temp.check('organization_contacts: client unlinks its contact', 'client', $q$with x as (delete from public.organization_contacts where contact_id = '0000ace5-0000-4000-8000-0000000b0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('organization_contacts: unlinked client can''t unlink', 'client_b', $q$with x as (delete from public.organization_contacts returning 1) select count(*) from x$q$, '0');
select pg_temp.check('email_settings: admin sees them', 'admin', $q$select count(*) from public.email_settings$q$, '1');
select pg_temp.check('email_settings: sees nothing', 'client', $q$select count(*) from public.email_settings$q$, '0');
select pg_temp.check('email_settings: admin can''t change them in the app', 'admin', $q$with x as (update public.email_settings set mode = 'live' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('claim_due_emails: the public can''t call it', 'anon', $q$select public.claim_due_emails('x', 1)$q$, 'denied');
select pg_temp.check('claim_due_emails: admin can''t call it', 'admin', $q$select public.claim_due_emails('x', 1)$q$, 'denied');
select pg_temp.check('finish_email: signed-in users can''t call it', 'factory', $q$select public.finish_email('x', '0000ace5-0000-4000-8000-000000000000', null, null)$q$, 'denied');

-- Report, and undo everything above.
do $$
declare
  total int;
  failed int;
  details text;
begin
  select count(*), count(*) filter (where not passed) into total, failed from pg_temp.results;
  select string_agg(format('%s. [%s] %s: expected %s, got %s', n, who, test, expected, got), E'\n' order by n)
  into details from pg_temp.results where not passed;
  if failed = 0 then
    raise exception 'ACCESS TESTS PASSED: % checks (all test data and changes undone)', total;
  end if;
  raise exception E'ACCESS TESTS FAILED: % of % checks (all test data and changes undone)\n%', failed, total, details;
end $$;

rollback;
