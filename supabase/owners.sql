-- Studio 414 owner page: the list of owner accounts and the check admin.html makes.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it skips or replaces what already exists).
--
-- Owners sign in on admin.html with their email and password (Supabase Auth). The page
-- then calls is_owner(), which says whether the signed-in account's email is in
-- site_owners. The list itself isn't reachable through the API: Row Level Security is
-- on with no policies, and anon and authenticated have no privileges on the table.
-- is_owner() only ever answers true or false, and only about the caller's own email
-- (false when nobody is signed in).
--
-- Add an owner, in two steps:
--   1. Authentication -> Users -> Add user -> Create new user: their email and a
--      password, with Auto Confirm User ticked.
--   2. Their email, in lower case, here in the SQL Editor:
--
--   insert into public.site_owners (email) values ('owner@example.com');
--
-- Remove one (and delete their user in Authentication -> Users if they no longer need
-- to sign in):
--
--   delete from public.site_owners where email = 'owner@example.com';
--
-- Change an owner's password: Authentication -> Users, that user's menu.
--
-- See the list: Table Editor -> site_owners.

create table if not exists public.site_owners (
  email    text primary key
           constraint site_owners_email_lower check (email = lower(btrim(email)) and email <> ''),
  added_at timestamptz not null default now()
);

alter table public.site_owners enable row level security;

-- No policies (deliberately): nobody can read or change the list with the public key
-- or a signed-in session. Only is_owner() below reads it.
revoke all on table public.site_owners from anon, authenticated;

-- True when the signed-in account's email is an owner's. Emails are stored in lower
-- case and the session's email is lower-cased to match.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_owners as o
    where o.email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Anyone may ask; without a signed-in session there is no email, so the answer is false.
-- (Postgres grants execute on new functions to public; replace that with these two.)
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- Let the API see the new function straight away.
notify pgrst, 'reload schema';
