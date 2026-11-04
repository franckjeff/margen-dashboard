-- The Users page lets admins set each person's first name, but only the role column was
-- updatable, so saving a name failed with a permission error. The "Admins can change roles"
-- policy still limits which rows can be updated to admins.
grant update (first_name) on public.profiles to authenticated;
