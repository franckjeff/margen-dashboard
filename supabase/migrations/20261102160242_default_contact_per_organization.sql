alter table public.organization_contacts
  add column is_default boolean not null default false;

-- At most one default contact per organization.
create unique index organization_contacts_one_default
  on public.organization_contacts (organization_id)
  where is_default;

-- Making a contact the default takes the flag away from the organization's previous default.
create function private.switch_default_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default and not old.is_default then
    update public.organization_contacts
      set is_default = false
      where organization_id = new.organization_id
        and contact_id <> new.contact_id
        and is_default;
  end if;
  return new;
end;
$$;

create trigger switch_default_contact
  before update of is_default on public.organization_contacts
  for each row execute function private.switch_default_contact();

-- When an organization is left with exactly one contact and no default, that contact becomes the default.
create function private.ensure_default_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org uuid := coalesce(new.organization_id, old.organization_id);
begin
  -- Skip while the organization itself is being deleted (its links are removed by cascade).
  if not exists (select 1 from public.organizations where id = org) then
    return null;
  end if;
  if (select count(*) from public.organization_contacts where organization_id = org) = 1
     and not exists (select 1 from public.organization_contacts where organization_id = org and is_default) then
    update public.organization_contacts set is_default = true where organization_id = org;
  end if;
  return null;
end;
$$;

create trigger ensure_default_contact
  after insert or delete on public.organization_contacts
  for each row execute function private.ensure_default_contact();

-- Apply the rule to existing organizations that have a single contact.
update public.organization_contacts oc
  set is_default = true
  where (select count(*) from public.organization_contacts x where x.organization_id = oc.organization_id) = 1;
