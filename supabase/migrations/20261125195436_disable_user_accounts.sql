-- Admins can disable a Factory or Client account, enable it again, or delete it (the manage-user function).
--
-- A disabled account keeps its profile, links and history, but it can't sign in (the function bans it in
-- Supabase Auth) and, straight away, sees nothing and changes nothing: the helpers every factory and client
-- rule goes through ignore disabled profiles, so a session that is still open loses its access too.
--
-- Only the manage-user function sets disabled_at (with the secret key), so the ban and the mark stay together.
-- Admin accounts can't be disabled, and a disabled account can't be made an admin.

alter table public.profiles add column disabled_at timestamptz;

comment on column public.profiles.disabled_at is
  'When an admin disabled this Factory or Client account; null while it is active. Set only by the manage-user function.';

create or replace function private.my_factory()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select factory_id from public.profiles
  where id = (select auth.uid()) and role = 'factory' and disabled_at is null;
$$;

create or replace function private.my_organization()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles
  where id = (select auth.uid()) and role = 'client' and disabled_at is null;
$$;

create or replace function private.no_disabled_admins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'admin' and new.disabled_at is not null then
    raise exception 'Admin accounts can''t be disabled. Enable the account before making it an admin.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger no_disabled_admins
before update of role, disabled_at on public.profiles
for each row execute function private.no_disabled_admins();

-- Same as before, except that a disabled client account can't send an order.
create or replace function public.submit_order_request(organization_name text, contact_name text, email text, phone text, notes text, file_name text, lines jsonb, website text default null::text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request uuid;
  clean_email text := lower(btrim(email));
begin
  if not (select private.is_admin())
     and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'client' and p.disabled_at is null) then
    raise exception 'Sign in with your client account to send an order.' using errcode = '42501';
  end if;

  if coalesce(btrim(website), '') <> '' then
    return;
  end if;

  if (select count(*) from public.order_requests r where r.email = clean_email and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve sent several order requests in the last hour. Please wait a little before sending another.';
  end if;
  if (select count(*) from public.order_requests r where r.created_at > now() - interval '1 hour') >= 50 then
    raise exception 'We''re receiving a lot of order requests right now. Please try again in an hour.';
  end if;

  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'Add at least one item to your order.';
  end if;
  if jsonb_array_length(lines) > 500 then
    raise exception 'An order request can have at most 500 lines.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(lines) l
    where not exists (select 1 from public.items i where i.id::text = l->>'item_id')
       or coalesce(l->>'size', '') not in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '2', '4', '6', '8', '10', '12', '14', '16')
       or case when l->>'quantity' ~ '^[0-9]{1,5}$' then (l->>'quantity')::integer < 1 else true end
  ) then
    raise exception 'Some lines have an unknown item or size, or a quantity that isn''t a whole number from 1 to 99999.';
  end if;

  insert into public.order_requests (organization_name, contact_name, email, phone, notes, file_name)
  values (
    btrim(organization_name),
    btrim(contact_name),
    clean_email,
    nullif(btrim(phone), ''),
    nullif(btrim(notes), ''),
    nullif(btrim(file_name), '')
  )
  returning id into request;

  insert into public.order_request_lines (request_id, item_id, size, quantity)
  select request, (l->>'item_id')::uuid, l->>'size', sum((l->>'quantity')::integer)
  from jsonb_array_elements(lines) l
  group by (l->>'item_id')::uuid, l->>'size';
end;
$function$;
