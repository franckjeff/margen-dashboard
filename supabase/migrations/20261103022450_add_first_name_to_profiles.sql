-- The name the Dashboard greets each user by. Admins set it on the Users page.
alter table public.profiles
  add column first_name text check (first_name is null or length(btrim(first_name)) > 0);
