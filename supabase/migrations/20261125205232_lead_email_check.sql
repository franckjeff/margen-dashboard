-- Leads only accept a full email address, the same rule as contacts and order requests (and src/lib/email.ts).
-- Every lead already saved passes it.
alter table public.leads add constraint leads_email_check
  check (email is null or (length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
