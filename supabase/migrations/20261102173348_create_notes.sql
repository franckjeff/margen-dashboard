-- Timestamped notes (calls, conversations, key facts) about a contact or an athlete.
-- Each note belongs to exactly one of them and is deleted with it.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notes_one_subject check (num_nonnulls(contact_id, athlete_id) = 1)
);

create index notes_contact_id_idx on public.notes (contact_id, created_at desc);
create index notes_athlete_id_idx on public.notes (athlete_id, created_at desc);
create index notes_created_by_idx on public.notes (created_by);

alter table public.notes enable row level security;

create policy "Admins have full access to notes" on public.notes
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
