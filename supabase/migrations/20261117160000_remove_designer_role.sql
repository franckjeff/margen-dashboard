-- The Designer access level is removed, with the Designs section it was for. No account uses it.
-- Accounts are now admin, factory or client.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'factory', 'client'));
