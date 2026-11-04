-- Access-rule tests: checks what each kind of user can and can't see or change, table by table.
--
-- How to run: paste this whole file into the SQL editor of the MARGEN TEST project and run it
-- (it's also safe on MARGEN PROD, the live project). It always ends with
-- an error, on purpose, so that nothing it does is kept: the test users and records it creates,
-- and every change it tries, are all undone. Read the result in the error message:
--   "ACCESS TESTS PASSED: 177 checks"  or  "ACCESS TESTS FAILED: 2 of 177 checks" followed by each failure.
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
    when 'designer' then '0000ace5-0000-4000-8000-000000000005'
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
from unnest(array['admin', 'factory', 'factory_b', 'client', 'designer']) w;

insert into public.factories (id, name, contact_name) values
  ('0000ace5-0000-4000-8000-0000000f0001', 'Access test factory A', 'Test'),
  ('0000ace5-0000-4000-8000-0000000f0002', 'Access test factory B', 'Test');

update public.profiles set role = 'admin' where id = pg_temp.user_id('admin');
update public.profiles set role = 'factory', factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = pg_temp.user_id('factory');
update public.profiles set role = 'factory', factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = pg_temp.user_id('factory_b');
update public.profiles set role = 'client' where id = pg_temp.user_id('client');
update public.profiles set role = 'designer' where id = pg_temp.user_id('designer');

insert into public.items (id, item_code, name) values
  ('0000ace5-0000-4000-8000-0000000e0001', 'ACCESS-TEST-X', 'Access test item X'),
  ('0000ace5-0000-4000-8000-0000000e0002', 'ACCESS-TEST-Y', 'Access test item Y');
insert into public.organizations (id, name) values ('0000ace5-0000-4000-8000-0000000b0001', 'Access test organization');
insert into public.contacts (id, first_name, last_name) values ('0000ace5-0000-4000-8000-0000000b0002', 'Access', 'Test');
insert into public.organization_contacts (organization_id, contact_id) values ('0000ace5-0000-4000-8000-0000000b0001', '0000ace5-0000-4000-8000-0000000b0002');
insert into public.athletes (id, first_name, last_name) values ('0000ace5-0000-4000-8000-0000000b0003', 'Access', 'Test');
insert into public.leads (id, first_name, last_name) values ('0000ace5-0000-4000-8000-0000000b0004', 'Access', 'Test');
insert into public.notes (id, organization_id, body) values ('0000ace5-0000-4000-8000-0000000b0005', '0000ace5-0000-4000-8000-0000000b0001', 'Access test note');
-- Order A is factory A's (with item X), order B is factory B's (with item Y).
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
  (pg_temp.user_id('designer'), 'Designer ideas');
insert into public.app_errors (kind, message) values ('background', 'Access test error');

-- Admin-only tables: everyone but admins sees nothing and can't add, change or delete.
do $$
declare
  t text;
  who text;
begin
  foreach t in array array['organizations', 'contacts', 'organization_contacts', 'athletes', 'leads', 'notes',
                           'order_requests', 'order_request_lines', 'order_events', 'app_errors'] loop
    perform pg_temp.check(t || ': admin sees them', 'admin', format('select (count(*) > 0)::int from public.%I', t), '1');
    foreach who in array array['anon', 'client', 'designer', 'factory'] loop
      perform pg_temp.check(t || ': sees nothing', who, format('select count(*) from public.%I', t), '0');
      perform pg_temp.check(t || ': can''t delete', who, format('with x as (delete from public.%I returning 1) select count(*) from x', t), '0');
    end loop;
  end loop;
end $$;

-- Adding to admin-only tables.
select pg_temp.check('organizations: admin can add', 'admin', $q$insert into public.organizations (name) values ('New')$q$, 'ok');
select pg_temp.check('organizations: can''t add', 'client', $q$insert into public.organizations (name) values ('New')$q$, 'denied');
select pg_temp.check('organizations: can''t add', 'anon', $q$insert into public.organizations (name) values ('New')$q$, 'denied');
select pg_temp.check('contacts: can''t add', 'designer', $q$insert into public.contacts (first_name, last_name) values ('A', 'B')$q$, 'denied');
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
select pg_temp.check('orders: sees nothing', 'client', $q$select count(*) from public.orders$q$, '0');
select pg_temp.check('orders: sees nothing', 'designer', $q$select count(*) from public.orders$q$, '0');
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
select pg_temp.check('order_items: sees nothing', 'client', $q$select count(*) from public.order_items$q$, '0');
select pg_temp.check('order_items: sees nothing', 'anon', $q$select count(*) from public.order_items$q$, '0');
select pg_temp.check('order_items: admin can add lines', 'admin', $q$insert into public.order_items (order_id, item_id, size, quantity) values ('0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000e0001', 'S', 1)$q$, 'ok');

-- Items: a factory sees only the items on its orders; only admins change them.
select pg_temp.check('items: factory sees items on its orders', 'factory', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0001'$q$, '1');
select pg_temp.check('items: factory doesn''t see other items', 'factory', $q$select count(*) from public.items where id = '0000ace5-0000-4000-8000-0000000e0002'$q$, '0');
select pg_temp.check('items: factory can''t change', 'factory', $q$with x as (update public.items set name = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('items: sees nothing', 'client', $q$select count(*) from public.items$q$, '0');
select pg_temp.check('items: sees nothing', 'designer', $q$select count(*) from public.items$q$, '0');
select pg_temp.check('items: sees nothing', 'anon', $q$select count(*) from public.items$q$, '0');
select pg_temp.check('items: can''t add', 'client', $q$insert into public.items (item_code, name) values ('X', 'X')$q$, 'denied');
select pg_temp.check('items: admin can rename', 'admin', $q$with x as (update public.items set name = 'Renamed' where id = '0000ace5-0000-4000-8000-0000000e0001' returning 1) select count(*) from x$q$, '1');

-- Factories: a factory user sees only their own factory, read only.
select pg_temp.check('factories: factory sees only its own', 'factory', $q$select count(*) from public.factories$q$, '1');
select pg_temp.check('factories: factory can''t change its details', 'factory', $q$with x as (update public.factories set name = 'x' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('factories: sees nothing', 'client', $q$select count(*) from public.factories$q$, '0');
select pg_temp.check('factories: sees nothing', 'anon', $q$select count(*) from public.factories$q$, '0');
select pg_temp.check('factories: can''t add', 'factory', $q$insert into public.factories (name, contact_name) values ('x', 'x')$q$, 'denied');

-- Profiles: users see their own; only admins see everyone and change roles, factories and first names.
select pg_temp.check('profiles: sees only their own', 'client', $q$select count(*) from public.profiles$q$, '1');
select pg_temp.check('profiles: sees only their own', 'factory', $q$select count(*) from public.profiles$q$, '1');
select pg_temp.check('profiles: sees nothing', 'anon', $q$select count(*) from public.profiles$q$, '0');
select pg_temp.check('profiles: admin sees the test users', 'admin', $q$select count(*) from public.profiles where email like '%@access-test.invalid'$q$, '5');
select pg_temp.check('profiles: can''t make themselves admin', 'client', $q$with x as (update public.profiles set role = 'admin' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: factory can''t switch to another factory', 'factory', $q$with x as (update public.profiles set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: can''t change their first name', 'designer', $q$with x as (update public.profiles set first_name = 'X' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: can''t change their email', 'admin', $q$update public.profiles set email = 'x@y.co' where id = auth.uid()$q$, 'denied');
select pg_temp.check('profiles: can''t add', 'client', $q$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@y.co')$q$, 'denied');
select pg_temp.check('profiles: admin can change a role', 'admin', $q$with x as (update public.profiles set role = 'designer' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('profiles: admin can set a first name', 'admin', $q$with x as (update public.profiles set first_name = 'Test' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');

-- Scrapbooks: each user sees and changes only their own.
select pg_temp.check('scrapbooks: sees only their own', 'client', $q$select count(*) from public.scrapbooks$q$, '1');
select pg_temp.check('scrapbooks: sees only their own', 'designer', $q$select count(*) from public.scrapbooks$q$, '1');
select pg_temp.check('scrapbooks: admin sees only their own too', 'admin', $q$select count(*) from public.scrapbooks where user_id <> auth.uid()$q$, '0');
select pg_temp.check('scrapbooks: can''t change someone else''s', 'client', $q$with x as (update public.scrapbooks set body = 'x' where user_id = '0000ace5-0000-4000-8000-000000000005' returning 1) select count(*) from x$q$, '0');
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
select pg_temp.check('log_app_error: signed-in users can log an error', 'designer', $q$select public.log_app_error('crash', 'x', '', '#/designs', '')$q$, 'ok');

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
