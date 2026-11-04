-- Each user's scrapbook: one free-text page on their Dashboard for ideas.
-- It's private: each user sees and changes only their own, admins included.
create table public.scrapbooks (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  body text not null default '' check (length(body) <= 100000),
  updated_at timestamptz not null default now()
);

alter table public.scrapbooks enable row level security;

create policy "Users manage their own scrapbook" on public.scrapbooks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
