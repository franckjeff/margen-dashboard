-- Notes a user has hidden from their Dashboard. The note itself is kept;
-- each user only sees and manages their own dismissals.
create table public.note_dismissals (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, note_id)
);

create index note_dismissals_note_id_idx on public.note_dismissals (note_id);

alter table public.note_dismissals enable row level security;

create policy "Users manage their own note dismissals" on public.note_dismissals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
