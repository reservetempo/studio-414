-- Studio 414 comment section: table, privileges and Row Level Security.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it skips or replaces what already exists).
--
-- There is no login: the public "anon" key may read every comment and add new ones,
-- and nothing else. Nobody can edit or delete comments through the API; the owner
-- moderates by deleting rows in the dashboard (Table Editor -> comments).

create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  name       text not null
             constraint comments_name_length check (char_length(name) between 1 and 40)
             constraint comments_name_not_blank check (name ~ '\S'),
  body       text not null
             constraint comments_body_length check (char_length(body) between 1 and 2000)
             constraint comments_body_not_blank check (body ~ '\S'),
  created_at timestamptz not null default now()
);

-- The page lists comments in created_at order.
create index if not exists comments_created_at_idx on public.comments (created_at);

alter table public.comments enable row level security;

-- Table privileges. Visitors may read everything, but may only supply name and body
-- when inserting, so id and created_at always come from the database. No update,
-- delete or truncate for anyone using the public key.
-- (Granted explicitly, so this works even if the project doesn't expose new tables
-- to the API automatically.)
grant usage on schema public to anon;
revoke all on table public.comments from anon, authenticated;
grant select on table public.comments to anon;
grant insert (name, body) on table public.comments to anon;

-- Row Level Security policies: anon may SELECT and INSERT only.
-- (There are deliberately no UPDATE or DELETE policies.)
drop policy if exists "Anyone can read comments" on public.comments;
create policy "Anyone can read comments"
  on public.comments
  for select
  to anon
  using (true);

drop policy if exists "Anyone can add a comment" on public.comments;
create policy "Anyone can add a comment"
  on public.comments
  for insert
  to anon
  with check (
    char_length(name) between 1 and 40
    and char_length(body) between 1 and 2000
  );
