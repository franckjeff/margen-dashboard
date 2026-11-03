-- A Designer account sees only the Dashboard and the Designs section. It gets no access to any table:
-- every existing policy is for admins or factory users only.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'factory', 'client', 'designer'));
