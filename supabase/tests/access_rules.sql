-- Access-rule tests: checks what each kind of user can and can't see or change, table by table.
--
-- How to run: paste this whole file into the SQL editor of the MARGEN TEST project and run it
-- (it's also safe on MARGEN PROD, the live project). It always ends with
-- an error, on purpose, so that nothing it does is kept: the test users and records it creates,
-- and every change it tries, are all undone. Read the result in the error message:
--   "ACCESS TESTS PASSED: 350 checks"  or  "ACCESS TESTS FAILED: 2 of 350 checks" followed by each failure.
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
insert into public.notes (lead_id, body) values ('0000ace5-0000-4000-8000-0000000b0004', 'Access test lead note');
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

-- Steps an order's production, one status at a time, up to the target (statuses follow the flow).
create function pg_temp.walk_production(order_id uuid, target text) returns void language plpgsql as $f$
declare
  steps text[] := array['received', 'accepted', 'artwork_in_progress', 'in_printing_queue', 'sewing', 'trimming', 'shipped'];
  current_step int := coalesce(array_position(steps, (select production_status from public.orders where id = order_id)), 0);
begin
  for i in current_step + 1 .. array_position(steps, target) loop
    update public.orders set production_status = steps[i] where id = order_id;
  end loop;
end $f$;
-- Adds an order as the signed-in user, accepts it and assigns it to factory A: 1 when it's then
-- In production at Not started.
create function pg_temp.accept_and_assign() returns int language plpgsql as $f$
declare
  made uuid;
begin
  insert into public.orders (margen_order_id) values ('ACCESS_TEST_C') returning id into made;
  update public.orders set order_status = 'accepted' where id = made;
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = made;
  return (select count(*) from public.orders where id = made and order_status = 'in_production' and production_status is null);
end $f$;

-- Changes that cancel or queue emails, run as the signed-in user, counting what the outbox then holds.
create function pg_temp.undo_shipping() returns int language plpgsql as $f$
begin
  update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001';
  return (select count(*) from public.email_outbox where order_id = '0000ace5-0000-4000-8000-0000000d0001'
          and kind = 'order_shipped' and status = 'cancelled');
end $f$;
create function pg_temp.reassign_order() returns int language plpgsql as $f$
begin
  -- Order A is shipped: step production back so it's In production again, then move it.
  update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001';
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = '0000ace5-0000-4000-8000-0000000d0001';
  return (select count(*) from public.email_outbox where order_id = '0000ace5-0000-4000-8000-0000000d0001' and kind = 'order_assigned'
          and ((contact_id = '0000ace5-0000-4000-8000-0000000f0011' and status = 'cancelled')
            or (contact_id = '0000ace5-0000-4000-8000-0000000f0012' and status = 'skipped')));
end $f$;
-- Ships order B for an organization with no contacts: nobody to email.
create function pg_temp.ship_to_org_without_contacts() returns int language plpgsql as $f$
begin
  insert into public.organizations (id, name) values ('0000ace5-0000-4000-8000-0000000b0010', 'Access test organization without contacts');
  update public.orders set organization_id = '0000ace5-0000-4000-8000-0000000b0010' where id = '0000ace5-0000-4000-8000-0000000d0002';
  perform pg_temp.walk_production('0000ace5-0000-4000-8000-0000000d0002', 'shipped');
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

-- Sends a quote request (website is the bot trap) as the signed-in user, then counts, as the test's owner (who
-- sees everything), the lead it made: 10 per lead, plus 1 when exactly every admin with an email has one waiting.
create function pg_temp.quote_makes_lead(website text) returns int language plpgsql as $f$
begin
  perform public.submit_quote_request(' Jane ', 'van Dyke', 'Lead test club', 'Lead-Test@Example.invalid', '', 'Spain', ' Hello ', website);
  return pg_temp.quote_lead_count();
end $f$;
create function pg_temp.quote_lead_count() returns int language plpgsql security definer as $f$
begin
  return 10 * (select count(*) from public.leads l
               where l.email = 'lead-test@example.invalid' and l.first_name = 'Jane' and l.last_name = 'van Dyke'
                 and l.source = 'Quote request' and l.organization_name = 'Lead test club' and l.country = 'Spain'
                 and l.phone is null and l.notes = 'Hello')
       + (select (count(*) > 0 and count(*) = (select count(*) from public.profiles where role = 'admin' and coalesce(btrim(email), '') <> ''))::int
          from public.email_outbox o join public.leads l on l.id = o.lead_id join public.profiles p on p.id = o.recipient_id
          where l.email = 'lead-test@example.invalid' and o.kind = 'quote_request' and o.status = 'pending' and p.role = 'admin');
end $f$;

-- Adds, edits and deletes a note about the test athlete as the signed-in admin. One point each when:
-- every other admin with an email gets an "added" email, the admin who wrote it gets none, an edit sends
-- nothing more, and deleting the note drops its waiting emails.
create function pg_temp.athlete_note_emails() returns int language plpgsql as $f$
declare
  note uuid;
  others int := (select count(*) from public.profiles where role = 'admin' and coalesce(btrim(email), '') <> '' and id <> auth.uid());
  score int := 0;
begin
  insert into public.notes (athlete_id, body) values ('0000ace5-0000-4000-8000-0000000b0003', 'Athlete note') returning id into note;
  score := score + (select (count(*) = others)::int from public.email_outbox where note_id = note and kind = 'athlete_note_added' and status = 'pending');
  score := score + (select (count(*) = 0)::int from public.email_outbox where note_id = note and recipient_id = auth.uid());
  update public.notes set body = 'Athlete note, edited' where id = note;
  score := score + (select (count(*) = others)::int from public.email_outbox where note_id = note);
  delete from public.notes where id = note;
  score := score + (select (count(*) = 0)::int from public.email_outbox where note_id = note);
  return score;
end $f$;

-- Turns kinds of email off and on as the signed-in admin. One point each when: turning order request
-- emails off cancels the waiting one, a quote request while quote emails are off is logged as cancelled
-- for every admin, a sample still goes out while its kind is off, and turning both on again empties the list.
create function pg_temp.turn_emails_off() returns int language plpgsql as $f$
declare
  score int := 0;
begin
  perform public.set_email_kind_enabled('order_request', false);
  score := score + (select (count(*) > 0 and count(*) filter (where status = 'pending') = 0)::int from public.email_outbox
                    where order_request_id = '0000ace5-0000-4000-8000-0000000b0006' and last_error = 'Not sent: these emails were turned off.');
  perform public.set_email_kind_enabled('quote_request', false);
  perform public.submit_quote_request('Off', 'Test', '', 'off-test@example.invalid', '', '', 'Hi', '');
  score := score + (select (count(*) > 0 and bool_and(o.status = 'cancelled'))::int
                    from public.email_outbox o join public.leads l on l.id = o.lead_id where l.email = 'off-test@example.invalid');
  perform public.send_sample_email('quote_request');
  score := score + (select (count(*) = 1)::int from public.email_outbox where sample and kind = 'quote_request' and status = 'pending' and recipient_id = auth.uid());
  perform public.set_email_kind_enabled('order_request', true);
  perform public.set_email_kind_enabled('quote_request', true);
  score := score + (select (disabled_kinds = '{}')::int from public.email_settings);
  return score;
end $f$;
-- The signed-in admin stops getting quote request emails, then gets them again. One point each when:
-- stopping cancels the one waiting for them, it's recorded on their profile, the next quote request
-- queues nothing for them, a sample still reaches them, and getting them again empties the list.
create function pg_temp.mute_admin_email() returns int language plpgsql as $f$
declare
  score int := 0;
begin
  perform public.submit_quote_request('Mute', 'One', '', 'mute-one@example.invalid', '', '', 'Hi', '');
  perform public.set_admin_email(auth.uid(), 'quote_request', false);
  score := score + (select (count(*) = 1 and bool_and(o.status = 'cancelled'))::int
                    from public.email_outbox o join public.leads l on l.id = o.lead_id
                    where l.email = 'mute-one@example.invalid' and o.recipient_id = auth.uid());
  score := score + (select ('quote_request' = any (muted_email_kinds))::int from public.profiles where id = auth.uid());
  perform public.submit_quote_request('Mute', 'Two', '', 'mute-two@example.invalid', '', '', 'Hi', '');
  score := score + (select (count(*) = 0)::int from public.email_outbox o join public.leads l on l.id = o.lead_id
                    where l.email = 'mute-two@example.invalid' and o.recipient_id = auth.uid());
  perform public.send_sample_email('quote_request');
  score := score + (select (count(*) = 1)::int from public.email_outbox where sample and kind = 'quote_request' and recipient_id = auth.uid());
  perform public.set_admin_email(auth.uid(), 'quote_request', true);
  score := score + (select (muted_email_kinds = '{}')::int from public.profiles where id = auth.uid());
  return score;
end $f$;
-- Changes the sender and wait as the signed-in user: 1 when the settings then have them.
create function pg_temp.change_sender() returns int language plpgsql as $f$
begin
  perform public.set_email_sender('  Access Test <test@example.invalid> ', 7);
  return (select (from_address = 'Access Test <test@example.invalid>' and delay_minutes = 7)::int from public.email_settings);
end $f$;
-- Order notes. The test's owner (who sees everything) adds a note to each test order, signed out for a
-- moment so the notes aren't in the signed-in user's name, then the signed-in user counts the order notes they can see.
create function pg_temp.add_owner_order_notes() returns void language plpgsql security definer as $f$
declare
  claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.notes (order_id, body) values
    ('0000ace5-0000-4000-8000-0000000d0001', 'Order A note'),
    ('0000ace5-0000-4000-8000-0000000d0002', 'Order B note');
  perform set_config('request.jwt.claims', claims, true);
end $f$;
create function pg_temp.order_notes_seen() returns int language plpgsql as $f$
begin
  perform pg_temp.add_owner_order_notes();
  return (select count(*) from public.notes where order_id in ('0000ace5-0000-4000-8000-0000000d0001', '0000ace5-0000-4000-8000-0000000d0002'));
end $f$;
-- How many emails of a kind a note queued, counted by the test's owner (factories can't read the outbox).
create function pg_temp.note_emails(note uuid, kind text) returns int language sql security definer as $f$
  select count(*)::int from public.email_outbox o where o.note_id = note and o.kind = note_emails.kind and o.status = 'pending';
$f$;
create function pg_temp.admins_with_email() returns int language sql security definer as $f$
  select count(*)::int from public.profiles where role = 'admin' and coalesce(btrim(email), '') <> '';
$f$;
-- The signed-in factory user adds a note to their order: 1 when it's marked as the factory's and
-- emails every admin with an email address.
create function pg_temp.factory_note_emails() returns int language plpgsql as $f$
declare
  note uuid;
  admins int;
begin
  insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0001', 'From the factory') returning id into note;
  admins := pg_temp.admins_with_email();
  return (select (n.from_factory and pg_temp.note_emails(note, 'order_note_from_factory') = admins and admins > 0)::int
          from public.notes n where n.id = note);
end $f$;
-- The signed-in admin adds order notes. One point each when: a note on order A emails factory A's default
-- contact, one on order B is logged as Nobody to email (factory B's contact has no email), and a note
-- about an organization sends no order note email.
create function pg_temp.admin_note_emails() returns int language plpgsql as $f$
declare
  note uuid;
  score int := 0;
begin
  insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0001', 'From MARGEN') returning id into note;
  score := score + (select (count(*) = 1)::int from public.email_outbox
                    where note_id = note and kind = 'order_note_from_admin' and status = 'pending' and recipient_email = 'factory-a@access-test.invalid');
  insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0002', 'From MARGEN') returning id into note;
  score := score + (select (count(*) = 1)::int from public.email_outbox where note_id = note and kind = 'order_note_from_admin' and status = 'skipped');
  insert into public.notes (organization_id, body) values ('0000ace5-0000-4000-8000-0000000b0001', 'Not about an order') returning id into note;
  score := score + (select (count(*) = 0)::int from public.email_outbox where note_id = note);
  return score;
end $f$;
-- The signed-in factory user deletes notes on their order: 1 per own note deleted, 10 per note by someone else.
create function pg_temp.factory_deletes_notes() returns int language plpgsql as $f$
declare
  own int;
  others int;
begin
  perform pg_temp.add_owner_order_notes();
  insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0001', 'Mine');
  with x as (delete from public.notes where order_id is not null and created_by = auth.uid() returning 1) select count(*) into own from x;
  with x as (delete from public.notes where order_id is not null returning 1) select count(*) into others from x;
  return own + 10 * others;
end $f$;
-- The signed-in user takes order A off Shipped in production, then ships it: 1 when the order then
-- goes back to In production, 10 when it then becomes Shipped.
create function pg_temp.unship_and_ship() returns int language plpgsql as $f$
declare
  score int := 0;
begin
  update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001';
  score := score + (select (order_status = 'in_production')::int from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001');
  update public.orders set production_status = 'shipped' where id = '0000ace5-0000-4000-8000-0000000d0001';
  score := score + 10 * (select (order_status = 'shipped')::int from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001');
  return score;
end $f$;
-- Assigns order B around as the signed-in user, checking its order and production status after each step:
-- 1 when moving it to factory A from production Accepted leaves it In production at Not started, 10 when
-- taking the factory off puts it back to Accepted, 100 when assigning it again puts it In production, 1000
-- when a move after work started leaves production alone.
create function pg_temp.assign_around() returns int language plpgsql as $f$
declare
  score int := 0;
  o text;
  p text;
begin
  perform pg_temp.walk_production('0000ace5-0000-4000-8000-0000000d0002', 'accepted');
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = '0000ace5-0000-4000-8000-0000000d0002' returning order_status, production_status into o, p;
  score := score + (o = 'in_production' and p is null)::int;
  update public.orders set factory_id = null where id = '0000ace5-0000-4000-8000-0000000d0002' returning order_status, production_status into o, p;
  score := score + 10 * (o = 'accepted' and p is null)::int;
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = '0000ace5-0000-4000-8000-0000000d0002' returning order_status, production_status into o, p;
  score := score + 100 * (o = 'in_production' and p is null)::int;
  perform pg_temp.walk_production('0000ace5-0000-4000-8000-0000000d0002', 'sewing');
  update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = '0000ace5-0000-4000-8000-0000000d0002' returning order_status, production_status into o, p;
  score := score + 1000 * (o = 'in_production' and p = 'sewing')::int;
  return score;
end $f$;
-- Pauses sending as the signed-in user: 1 when the settings then say paused.
create function pg_temp.pause_sending() returns int language plpgsql as $f$
begin
  perform public.set_email_sending_paused(true);
  return (select paused::int from public.email_settings);
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
-- Lead notes are for admins only, like leads.
select pg_temp.check('notes: can''t add to a lead', 'client', $q$insert into public.notes (lead_id, body) values ('0000ace5-0000-4000-8000-0000000b0004', 'x')$q$, 'denied');
select pg_temp.check('notes: lead notes hidden', 'client', $q$select count(*) from public.notes where lead_id is not null$q$, '0');
select pg_temp.check('notes: lead notes hidden', 'factory', $q$select count(*) from public.notes where lead_id is not null$q$, '0');
select pg_temp.check('notes: admin sees lead notes', 'admin', $q$select count(*) from public.notes where lead_id = '0000ace5-0000-4000-8000-0000000b0004'$q$, '1');
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
select pg_temp.check('orders: factory updates production status', 'factory', $q$with x as (update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: factory updates shipping details', 'factory', $q$with x as (update public.orders set tracking_number = 'T1', shipping_method = 'Air', estimated_ship_date = current_date, actual_ship_date = current_date where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: factory can''t update another factory''s order', 'factory', $q$with x as (update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0002' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: factory can''t change the order status', 'factory', $q$update public.orders set order_status = 'received' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t change the Margen order ID', 'factory', $q$update public.orders set margen_order_id = 'X' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t change the organization', 'factory', $q$update public.orders set organization_id = null where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t hand the order to another factory', 'factory', $q$update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0002' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: factory can''t add', 'factory', $q$insert into public.orders (margen_order_id, factory_id) values ('ACCESS_TEST_NEW', '0000ace5-0000-4000-8000-0000000f0001')$q$, 'denied');
select pg_temp.check('orders: factory can''t delete', 'factory', $q$with x as (delete from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: can''t add', 'client', $q$insert into public.orders (margen_order_id) values ('ACCESS_TEST_NEW')$q$, 'denied');
select pg_temp.check('orders: can''t change', 'client', $q$with x as (update public.orders set order_status = 'shipped' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('orders: admin can cancel an order in production', 'admin', $q$with x as (update public.orders set order_status = 'cancelled' where id = '0000ace5-0000-4000-8000-0000000d0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: Done is no longer an order status', 'admin', $q$update public.orders set order_status = 'done' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: On hold is no longer an order status', 'admin', $q$update public.orders set order_status = 'on_hold' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: shipping in production ships the order, and undoing it takes it back', 'factory', $q$select pg_temp.unship_and_ship()$q$, '11');
select pg_temp.check('orders: shipping in production ships the order for admins too', 'admin', $q$select pg_temp.unship_and_ship()$q$, '11');
select pg_temp.check('orders: a shipped order''s status can''t change', 'admin', $q$update public.orders set order_status = 'received' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: a shipped order can''t be cancelled', 'admin', $q$update public.orders set order_status = 'cancelled' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: admin can''t mark an order Shipped by hand', 'admin', $q$update public.orders set order_status = 'shipped' where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: admin can''t move an order back from In production by hand', 'admin', $q$update public.orders set order_status = 'accepted' where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: a new order can''t start at another status', 'admin', $q$insert into public.orders (margen_order_id, order_status) values ('ACCESS_TEST_C', 'accepted')$q$, 'error');
select pg_temp.check('orders: a new order can''t start with production', 'admin', $q$insert into public.orders (margen_order_id, production_status) values ('ACCESS_TEST_C', 'received')$q$, 'error');
select pg_temp.check('orders: a new order can''t start with a factory', 'admin', $q$insert into public.orders (margen_order_id, factory_id) values ('ACCESS_TEST_C', '0000ace5-0000-4000-8000-0000000f0001')$q$, 'error');
select pg_temp.check('orders: an accepted order assigned to a factory goes In production, at Not started', 'admin', $q$select pg_temp.accept_and_assign()$q$, '1');
select pg_temp.check('orders: a received order can''t be assigned to a factory', 'admin', $q$insert into public.orders (margen_order_id) values ('ACCESS_TEST_C'); update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0001' where margen_order_id = 'ACCESS_TEST_C'$q$, 'error');
select pg_temp.check('orders: production can''t jump a step', 'factory', $q$update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: production can''t jump a step, for admins either', 'admin', $q$update public.orders set production_status = 'sewing' where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: production steps on from Not started', 'factory_b', $q$with x as (update public.orders set production_status = 'received' where id = '0000ace5-0000-4000-8000-0000000d0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: production can''t change on a cancelled order', 'admin', $q$update public.orders set order_status = 'cancelled' where id = '0000ace5-0000-4000-8000-0000000d0002'; update public.orders set production_status = 'received' where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: the factory can''t be taken off once production has started', 'admin', $q$select pg_temp.walk_production('0000ace5-0000-4000-8000-0000000d0002', 'artwork_in_progress'); update public.orders set factory_id = null where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: an order without a factory starts Received, at Not started', 'admin', $q$with x as (insert into public.orders (margen_order_id) values ('ACCESS_TEST_C') returning order_status, production_status) select count(*) from x where order_status = 'received' and production_status is null$q$, '1');
select pg_temp.check('orders: moving, removing and adding the factory sets the order and production status', 'admin', $q$select pg_temp.assign_around()$q$, '1111');
select pg_temp.check('orders: admin can archive a shipped order', 'admin', $q$with x as (update public.orders set archived_at = now() where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('orders: only shipped orders can be archived', 'admin', $q$update public.orders set archived_at = now() where id = '0000ace5-0000-4000-8000-0000000d0002'$q$, 'error');
select pg_temp.check('orders: an archived order''s production can''t change', 'admin', $q$update public.orders set archived_at = now() where id = '0000ace5-0000-4000-8000-0000000d0001'; update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'error');
select pg_temp.check('orders: admin can unarchive, then change it', 'admin', $q$update public.orders set archived_at = now() where id = '0000ace5-0000-4000-8000-0000000d0001'; update public.orders set archived_at = null where id = '0000ace5-0000-4000-8000-0000000d0001'; update public.orders set production_status = 'trimming' where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'ok');
select pg_temp.check('orders: factory can''t archive', 'factory', $q$update public.orders set archived_at = now() where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, 'denied');
select pg_temp.check('orders: client can''t archive', 'client', $q$with x as (update public.orders set archived_at = now() returning 1) select count(*) from x$q$, '0');

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
select pg_temp.check('orders: client can''t change its order', 'client', $q$with x as (update public.orders set order_status = 'shipped' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
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
select pg_temp.check('profiles: can''t change their last name', 'client', $q$with x as (update public.profiles set last_name = 'X' where id = auth.uid() returning 1) select count(*) from x$q$, '0');
select pg_temp.check('profiles: can''t change their email', 'admin', $q$update public.profiles set email = 'x@y.co' where id = auth.uid()$q$, 'denied');
select pg_temp.check('profiles: can''t add', 'client', $q$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@y.co')$q$, 'denied');
select pg_temp.check('profiles: admin can change a role', 'admin', $q$with x as (update public.profiles set role = 'factory' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('profiles: admin can set a first name', 'admin', $q$with x as (update public.profiles set first_name = 'Test' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('profiles: admin can set a last name', 'admin', $q$with x as (update public.profiles set last_name = 'Test' where id = '0000ace5-0000-4000-8000-000000000004' returning 1) select count(*) from x$q$, '1');
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
select pg_temp.check('order_entry_items: a client can list items', 'client', $q$select (count(*) > 0)::int from public.order_entry_items()$q$, '1');
select pg_temp.check('order_entry_items: the public can''t list items', 'anon', $q$select count(*) from public.order_entry_items()$q$, 'denied');
select pg_temp.check('submit_order_request: a client can send', 'client',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'ok');
select pg_temp.check('submit_order_request: an admin can send', 'admin',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'ok');
select pg_temp.check('submit_order_request: the public can''t send', 'anon',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'denied');
select pg_temp.check('submit_order_request: factories are refused', 'factory',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'denied');
select pg_temp.check('submit_order_request: refuses unknown items', 'client',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-000000000000", "size": "M", "quantity": 2}]', '')$q$, 'error');
select pg_temp.check('submit_quote_request: the public can send one, a lead that emails admins', 'anon', $q$select pg_temp.quote_makes_lead('')$q$, '11');
select pg_temp.check('submit_quote_request: signed-in users can send one too', 'client_b', $q$select pg_temp.quote_makes_lead('')$q$, '11');
select pg_temp.check('submit_quote_request: bots make no lead', 'anon', $q$select pg_temp.quote_makes_lead('http://spam.invalid')$q$, '0');
select pg_temp.check('submit_quote_request: refuses a request without a message', 'anon', $q$select public.submit_quote_request('Jane', 'Doe', '', 'jane@example.invalid', '', '', ' ', '')$q$, 'error');
select pg_temp.check('submit_quote_request: refuses a bad email', 'anon', $q$select public.submit_quote_request('Jane', 'Doe', '', 'not-an-email', '', '', 'Hi', '')$q$, 'error');
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
select pg_temp.check('email_outbox: athlete notes email the other admins', 'admin', $q$select pg_temp.athlete_note_emails()$q$, '4');
select pg_temp.check('email_outbox: other notes email nobody', 'admin', $q$select count(*) from public.email_outbox where note_id = '0000ace5-0000-4000-8000-0000000b0005'$q$, '0');
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
select pg_temp.check('contacts: client sets its contact''s phone and billing address', 'client', $q$with x as (update public.contacts set phone = '+33 6 12 34 56 78', whatsapp = true, billing_same_as_delivery = false, billing_city = 'Paris' where id = '0000ace5-0000-4000-8000-0000000b0002' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('contacts: client can''t set other contacts'' phones', 'client', $q$with x as (update public.contacts set phone = '1' where id = '0000ace5-0000-4000-8000-0000000f0011' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('contacts: factory sets its contact''s billing address', 'factory', $q$with x as (update public.contacts set billing_same_as_delivery = false, billing_country = 'France' where id = '0000ace5-0000-4000-8000-0000000f0011' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('contacts: phone is at most 50 characters', 'admin', $q$update public.contacts set phone = repeat('1', 51) where id = '0000ace5-0000-4000-8000-0000000b0002'$q$, 'error');
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
select pg_temp.check('set_email_sending_paused: admin pauses sending', 'admin', $q$select pg_temp.pause_sending()$q$, '1');
select pg_temp.check('set_email_sending_paused: client can''t', 'client', $q$select public.set_email_sending_paused(true)$q$, 'denied');
select pg_temp.check('set_email_sending_paused: the public can''t', 'anon', $q$select public.set_email_sending_paused(true)$q$, 'denied');
select pg_temp.check('set_email_kind_enabled: admin turns emails off and on', 'admin', $q$select pg_temp.turn_emails_off()$q$, '4');
select pg_temp.check('set_email_kind_enabled: refuses an unknown kind', 'admin', $q$select public.set_email_kind_enabled('nonsense', false)$q$, 'error');
select pg_temp.check('set_email_kind_enabled: factory can''t', 'factory', $q$select public.set_email_kind_enabled('order_request', false)$q$, 'denied');
select pg_temp.check('send_sample_email: goes to the admin who asks', 'admin', $q$select (public.send_sample_email('order_shipped') = 'admin@access-test.invalid')::int$q$, '1');
select pg_temp.check('send_sample_email: client can''t', 'client', $q$select public.send_sample_email('order_shipped')$q$, 'denied');
select pg_temp.check('set_admin_email: admin chooses who gets admin emails', 'admin', $q$select pg_temp.mute_admin_email()$q$, '5');
select pg_temp.check('set_admin_email: only for admins', 'admin', $q$select public.set_admin_email('0000ace5-0000-4000-8000-000000000004', 'quote_request', false)$q$, 'error');
select pg_temp.check('set_admin_email: refuses an email that isn''t for admins', 'admin', $q$select public.set_admin_email(auth.uid(), 'order_shipped', false)$q$, 'error');
select pg_temp.check('set_admin_email: factory can''t', 'factory', $q$select public.set_admin_email(auth.uid(), 'quote_request', false)$q$, 'denied');
select pg_temp.check('set_admin_email: the public can''t', 'anon', $q$select public.set_admin_email('0000ace5-0000-4000-8000-000000000004', 'quote_request', false)$q$, 'denied');
select pg_temp.check('set_email_sender: admin changes the sender and wait', 'admin', $q$select pg_temp.change_sender()$q$, '1');
select pg_temp.check('set_email_sender: refuses a sender that isn''t an address', 'admin', $q$select public.set_email_sender('MARGEN', 5)$q$, 'error');
select pg_temp.check('set_email_sender: refuses a wait over an hour', 'admin', $q$select public.set_email_sender('test@example.invalid', 61)$q$, 'error');
select pg_temp.check('set_email_sender: client can''t', 'client', $q$select public.set_email_sender('test@example.invalid', 5)$q$, 'denied');
select pg_temp.check('notes: admin sees every order''s notes', 'admin', $q$select pg_temp.order_notes_seen()$q$, '2');
select pg_temp.check('notes: factory sees its order''s notes only', 'factory', $q$select pg_temp.order_notes_seen()$q$, '1');
select pg_temp.check('notes: other factory sees its own order''s notes only', 'factory_b', $q$select pg_temp.order_notes_seen()$q$, '1');
select pg_temp.check('notes: client sees no order notes', 'client', $q$select pg_temp.order_notes_seen()$q$, '0');
select pg_temp.check('notes: factory adds a note to its order', 'factory', $q$insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0001', 'Hi')$q$, 'ok');
select pg_temp.check('notes: factory can''t add a note to another factory''s order', 'factory', $q$insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0002', 'Hi')$q$, 'denied');
select pg_temp.check('notes: factory can''t add other notes', 'factory', $q$insert into public.notes (factory_id, body) values ('0000ace5-0000-4000-8000-0000000f0001', 'Hi')$q$, 'denied');
select pg_temp.check('notes: client can''t add a note to its order', 'client', $q$insert into public.notes (order_id, body) values ('0000ace5-0000-4000-8000-0000000d0001', 'Hi')$q$, 'denied');
select pg_temp.check('notes: written in the signed-in user''s name', 'factory', $q$with x as (insert into public.notes (order_id, body, created_by) values ('0000ace5-0000-4000-8000-0000000d0001', 'Hi', '0000ace5-0000-4000-8000-000000000001') returning created_by) select count(*) from x where created_by = auth.uid()$q$, '1');
select pg_temp.check('notes: factory deletes only its own order notes', 'factory', $q$select pg_temp.factory_deletes_notes()$q$, '1');
select pg_temp.check('email_outbox: a factory''s order note emails the admins', 'factory', $q$select pg_temp.factory_note_emails()$q$, '1');
select pg_temp.check('email_outbox: an admin''s order note emails the factory', 'admin', $q$select pg_temp.admin_note_emails()$q$, '3');
select pg_temp.check('claim_due_emails: the public can''t call it', 'anon', $q$select public.claim_due_emails('x', 1)$q$, 'denied');
select pg_temp.check('claim_due_emails: admin can''t call it', 'admin', $q$select public.claim_due_emails('x', 1)$q$, 'denied');
select pg_temp.check('finish_email: signed-in users can''t call it', 'factory', $q$select public.finish_email('x', '0000ace5-0000-4000-8000-000000000000', null, null)$q$, 'denied');

-- Status colours: everyone signed in reads them, only admins change them.
insert into public.status_colors (kind, status, background) values ('order', 'shipped', '#00aa00')
  on conflict (kind, status) do update set background = excluded.background;
select pg_temp.check('status_colors: factory reads them', 'factory', $q$select (count(*) > 0)::int from public.status_colors$q$, '1');
select pg_temp.check('status_colors: client reads them', 'client', $q$select (count(*) > 0)::int from public.status_colors$q$, '1');
select pg_temp.check('status_colors: the public can''t read them', 'anon', $q$select count(*) from public.status_colors$q$, 'denied');
select pg_temp.check('status_colors: admin can set one', 'admin', $q$insert into public.status_colors (kind, status, background) values ('order', 'received', '#123456') on conflict (kind, status) do update set background = excluded.background$q$, 'ok');
select pg_temp.check('status_colors: admin can reset one', 'admin', $q$with x as (delete from public.status_colors where kind = 'order' and status = 'shipped' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('status_colors: only hex colours', 'admin', $q$update public.status_colors set background = 'red'$q$, 'error');
select pg_temp.check('status_colors: only known statuses', 'admin', $q$insert into public.status_colors (kind, status, background) values ('order', 'closed', '#123456')$q$, 'error');
select pg_temp.check('status_colors: factory can''t set one', 'factory', $q$insert into public.status_colors (kind, status, background) values ('order', 'cancelled', '#123456')$q$, 'denied');
select pg_temp.check('status_colors: client can''t change them', 'client', $q$with x as (update public.status_colors set background = '#000000' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('status_colors: factory can''t reset them', 'factory', $q$with x as (delete from public.status_colors returning 1) select count(*) from x$q$, '0');

-- dashboard_counts: the admin Dashboard's numbers. Admins only; it counts what the admin can see.
select pg_temp.check('dashboard_counts: admin gets the counts', 'admin', $q$select ((public.dashboard_counts()->>'orders')::int = (select count(*) from public.orders) and (public.dashboard_counts()->>'contacts')::int = (select count(*) from public.contacts))::int$q$, '1');
select pg_temp.check('dashboard_counts: factory is refused', 'factory', $q$select public.dashboard_counts()$q$, 'denied');
select pg_temp.check('dashboard_counts: client is refused', 'client', $q$select public.dashboard_counts()$q$, 'denied');
select pg_temp.check('dashboard_counts: the public is refused', 'anon', $q$select public.dashboard_counts()$q$, 'denied');

-- Disabled accounts (profiles.disabled_at, set only by the manage-user function with the secret key).
-- Nobody signed in can disable or enable an account, and a disabled account can't be made an admin.
select pg_temp.check('profiles: admin can''t disable an account directly', 'admin', $q$update public.profiles set disabled_at = now() where id = '0000ace5-0000-4000-8000-000000000002'$q$, 'denied');
select pg_temp.check('profiles: factory can''t enable itself', 'factory', $q$update public.profiles set disabled_at = null where id = '0000ace5-0000-4000-8000-000000000002'$q$, 'denied');

-- The factory and client accounts are now disabled (as the test's owner), with their sessions still open.
update public.profiles set disabled_at = now() where id in (pg_temp.user_id('factory'), pg_temp.user_id('client'));
select pg_temp.check('disabled: factory sees no orders', 'factory', $q$select count(*) from public.orders$q$, '0');
select pg_temp.check('disabled: factory can''t change its order', 'factory', $q$with x as (update public.orders set tracking_number = 'X' where id = '0000ace5-0000-4000-8000-0000000d0001' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('disabled: factory sees no factory', 'factory', $q$select count(*) from public.factories$q$, '0');
select pg_temp.check('disabled: client sees no orders', 'client', $q$select count(*) from public.orders$q$, '0');
select pg_temp.check('disabled: client sees no organization', 'client', $q$select count(*) from public.organizations$q$, '0');
select pg_temp.check('disabled: client can''t send an order', 'client',
  $q$select public.submit_order_request('Club', 'Name', 'access-test@example.invalid', '', '', '', '[{"item_id": "0000ace5-0000-4000-8000-0000000e0001", "size": "M", "quantity": 2}]', '')$q$, 'denied');
select pg_temp.check('disabled: still reads its own profile', 'client', $q$select count(*) from public.profiles where disabled_at is not null and id = '0000ace5-0000-4000-8000-000000000004'$q$, '1');
select pg_temp.check('disabled: admin still sees it', 'admin', $q$select count(*) from public.profiles where disabled_at is not null and id in ('0000ace5-0000-4000-8000-000000000002', '0000ace5-0000-4000-8000-000000000004')$q$, '2');
select pg_temp.check('disabled: can''t be made an admin', 'admin', $q$update public.profiles set role = 'admin' where id = '0000ace5-0000-4000-8000-000000000004'$q$, 'error');
update public.profiles set disabled_at = null where id in (pg_temp.user_id('factory'), pg_temp.user_id('client'));
select pg_temp.check('enabled again: factory sees its order', 'factory', $q$select count(*) from public.orders where id = '0000ace5-0000-4000-8000-0000000d0001'$q$, '1');

-- must_change_password: set only by the create-user function; password_changed() clears the caller's own flag.
update public.profiles set must_change_password = true where id in (pg_temp.user_id('client'), pg_temp.user_id('client_b'));
select pg_temp.check('profiles: can''t clear the temporary-password flag directly', 'client', $q$update public.profiles set must_change_password = false where id = '0000ace5-0000-4000-8000-000000000004'$q$, 'denied');
select pg_temp.check('profiles: admin can''t set the temporary-password flag', 'admin', $q$update public.profiles set must_change_password = true where id = '0000ace5-0000-4000-8000-000000000002'$q$, 'denied');
-- The client calls password_changed(); then (as the admin) their flag is off and client_b's still on.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.user_id('client'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.password_changed();
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.check('password_changed: clears only your own flag', 'admin', $q$select count(*) from public.profiles where id in ('0000ace5-0000-4000-8000-000000000004', '0000ace5-0000-4000-8000-000000000006') and must_change_password$q$, '1');
select pg_temp.check('password_changed: the public can''t call it', 'anon', $q$select public.password_changed()$q$, 'denied');
update public.profiles set must_change_password = false where id in (pg_temp.user_id('client'), pg_temp.user_id('client_b'));

-- Email addresses must be full ones (name@domain.ending), as in the app's forms.
select pg_temp.check('leads: email must be a full address', 'admin', $q$insert into public.leads (first_name, last_name, email) values ('Bad', 'Email', 'name@example')$q$, 'error');
select pg_temp.check('leads: a full email is fine', 'admin', $q$with x as (insert into public.leads (first_name, last_name, email) values ('Good', 'Email', 'name@example.com') returning 1) select count(*) from x$q$, '1');
select pg_temp.check('contacts: email must be a full address', 'admin', $q$insert into public.contacts (first_name, last_name, email) values ('Bad', 'Email', 'name example.com')$q$, 'error');

-- Deleting an organization: refused while it has orders neither cancelled nor archived, or client accounts linked
-- to it. Its cancelled and archived orders stay, with its name (orders.organization_name).
create function pg_temp.delete_organization_with(order_status text, archived boolean, linked_user text) returns int language plpgsql as $f$
declare
  org uuid := '0000ace5-0000-4000-8000-0000000b0020';
  made uuid;
begin
  insert into public.organizations (id, name) values (org, 'Access test organization to delete');
  if order_status is not null then
    insert into public.orders (margen_order_id, organization_id) values ('ACCESS_TEST_DEL', org) returning id into made;
    update public.orders set order_status = 'cancelled', archived_at = null where id = made and delete_organization_with.order_status = 'cancelled';
    if delete_organization_with.order_status = 'shipped' then
      update public.orders set order_status = 'accepted' where id = made;
      update public.orders set factory_id = '0000ace5-0000-4000-8000-0000000f0001' where id = made;
      perform pg_temp.walk_production(made, 'shipped');
      if archived then
        update public.orders set archived_at = now() where id = made;
      end if;
    end if;
  end if;
  if linked_user is not null then
    update public.profiles set organization_id = org where id = pg_temp.user_id(linked_user);
  end if;
  delete from public.organizations where id = org;
  return (select count(*) from public.orders where id = made and organization_id is null and organization_name = 'Access test organization to delete');
end $f$;
select pg_temp.check('organizations: can''t delete one with an order still going', 'admin', $q$select pg_temp.delete_organization_with('received', false, null)$q$, 'error');
select pg_temp.check('organizations: can''t delete one with a shipped order not archived', 'admin', $q$select pg_temp.delete_organization_with('shipped', false, null)$q$, 'error');
select pg_temp.check('organizations: can''t delete one with a client account linked', 'admin', $q$select pg_temp.delete_organization_with(null, false, 'client_b')$q$, 'error');
select pg_temp.check('organizations: deleting keeps a cancelled order, with the name', 'admin', $q$select pg_temp.delete_organization_with('cancelled', false, null)$q$, '1');
select pg_temp.check('organizations: deleting keeps an archived order, with the name', 'admin', $q$select pg_temp.delete_organization_with('shipped', true, null)$q$, '1');
select pg_temp.check('organizations: deleting one with nothing linked', 'admin', $q$select pg_temp.delete_organization_with(null, false, null)$q$, '0');
select pg_temp.check('organizations: client can''t delete', 'client', $q$with x as (delete from public.organizations where id = '0000ace5-0000-4000-8000-0000000b0001' returning 1) select count(*) from x$q$, '0');

-- Tasks. Task 1 is for the factory user (with a note from the admin), task 2 for the admin. Added here, after the
-- admin-only checks above, as the factory user can read their task's notes.
insert into public.tasks (id, title, assignee_id) values
  ('0000ace5-0000-4000-8000-0000000a0001', 'Access test task for the factory', pg_temp.user_id('factory')),
  ('0000ace5-0000-4000-8000-0000000a0002', 'Access test task for the admin', pg_temp.user_id('admin'));
insert into public.notes (task_id, body) values ('0000ace5-0000-4000-8000-0000000a0001', 'Access test task note');
select pg_temp.check('tasks: admin sees every task', 'admin', $q$select count(*) from public.tasks where id::text like '0000ace5-%'$q$, '2');
select pg_temp.check('tasks: factory sees only its own', 'factory', $q$select count(*) from public.tasks$q$, '1');
select pg_temp.check('tasks: other factory sees none', 'factory_b', $q$select count(*) from public.tasks$q$, '0');
select pg_temp.check('tasks: client sees none', 'client', $q$select count(*) from public.tasks$q$, '0');
select pg_temp.check('tasks: factory changes the status', 'factory', $q$with x as (update public.tasks set status = 'in_progress' where id = '0000ace5-0000-4000-8000-0000000a0001' returning 1) select count(*) from x$q$, '1');
select pg_temp.check('tasks: done sets when it was completed', 'factory', $q$with x as (update public.tasks set status = 'done' where id = '0000ace5-0000-4000-8000-0000000a0001' returning completed_at) select count(*) from x where completed_at is not null$q$, '1');
select pg_temp.check('tasks: factory can''t change the title', 'factory', $q$update public.tasks set title = 'x' where id = '0000ace5-0000-4000-8000-0000000a0001'$q$, 'denied');
select pg_temp.check('tasks: factory can''t give it to someone else', 'factory', $q$update public.tasks set assignee_id = '0000ace5-0000-4000-8000-000000000001' where id = '0000ace5-0000-4000-8000-0000000a0001'$q$, 'denied');
select pg_temp.check('tasks: factory can''t add', 'factory', $q$insert into public.tasks (title, assignee_id) values ('x', '0000ace5-0000-4000-8000-000000000002')$q$, 'denied');
select pg_temp.check('tasks: factory can''t delete', 'factory', $q$with x as (delete from public.tasks returning 1) select count(*) from x$q$, '0');
select pg_temp.check('tasks: other factory can''t change it', 'factory_b', $q$with x as (update public.tasks set status = 'done' returning 1) select count(*) from x$q$, '0');
select pg_temp.check('tasks: client can''t add', 'client', $q$insert into public.tasks (title) values ('x')$q$, 'denied');
select pg_temp.check('tasks: admin can''t give one to a client', 'admin', $q$insert into public.tasks (title, assignee_id) values ('x', '0000ace5-0000-4000-8000-000000000004')$q$, 'error');
select pg_temp.check('tasks: admin gives one to the other factory', 'admin', $q$insert into public.tasks (title, assignee_id) values ('x', '0000ace5-0000-4000-8000-000000000003')$q$, 'ok');
select pg_temp.check('tasks: emails the person it''s for', 'admin', $q$select count(*) from public.email_outbox where task_id = '0000ace5-0000-4000-8000-0000000a0001' and kind = 'task_assigned' and recipient_id = '0000ace5-0000-4000-8000-000000000002'$q$, '1');
select pg_temp.check('notes: factory sees its task''s notes', 'factory', $q$select count(*) from public.notes where task_id = '0000ace5-0000-4000-8000-0000000a0001'$q$, '1');
select pg_temp.check('notes: factory adds a note to its task', 'factory', $q$insert into public.notes (task_id, body) values ('0000ace5-0000-4000-8000-0000000a0001', 'x')$q$, 'ok');
select pg_temp.check('notes: factory can''t add to someone else''s task', 'factory', $q$insert into public.notes (task_id, body) values ('0000ace5-0000-4000-8000-0000000a0002', 'x')$q$, 'denied');
select pg_temp.check('notes: other factory doesn''t see the task''s notes', 'factory_b', $q$select count(*) from public.notes where task_id is not null$q$, '0');
select pg_temp.check('notes: other factory can''t add to the task', 'factory_b', $q$insert into public.notes (task_id, body) values ('0000ace5-0000-4000-8000-0000000a0001', 'x')$q$, 'denied');

-- Order history keeps the name of whoever made a change, even after their account is deleted. The factory
-- user changes order A's tracking number, then their account is deleted (as the test's owner). Last, as no
-- later check uses the factory user.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.user_id('factory'), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.orders set tracking_number = 'NAME-TEST' where id = '0000ace5-0000-4000-8000-0000000d0001';
reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = pg_temp.user_id('factory');
select pg_temp.check('order_events: history keeps a deleted user''s name', 'admin', $q$select count(*) from public.order_events where order_id = '0000ace5-0000-4000-8000-0000000d0001' and changed_by is null and changed_by_name = 'factory@access-test.invalid' and changes ? 'tracking_number'$q$, '1');

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
