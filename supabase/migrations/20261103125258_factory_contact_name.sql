-- A factory's main contact is now just a name kept on the factory; the Contacts table is for clients.
-- Existing factories keep the name of the contact they were linked to.
alter table public.factories add column contact_name text;

update public.factories f
set contact_name = c.first_name || ' ' || c.last_name
from public.contacts c
where c.id = f.contact_id;

alter table public.factories alter column contact_name set not null;
alter table public.factories add constraint factories_contact_name_check check (length(btrim(contact_name)) > 0);

drop index public.factories_contact_id_idx;
alter table public.factories drop column contact_id;
