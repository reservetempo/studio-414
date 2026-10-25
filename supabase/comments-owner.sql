-- Studio 414 comment section: owners may delete comments.
--
-- Run in the Supabase dashboard (SQL Editor -> New query -> paste -> Run) after
-- setup.sql (the comments table) and owners.sql (public.is_owner()). Run it again
-- whenever setup.sql is run again, as setup.sql takes these privileges back.
-- It is safe to run again (it replaces what already exists).
--
-- Owners delete comments from the preview page (preview.html), signed in, so as the
-- "authenticated" role. Visitors (the public "anon" key) still may only read and add
-- comments: nothing here is granted to anon. A signed-in account that isn't an owner
-- gets past the privileges but no policy lets it see or delete any row.

-- Delete, and select, which the delete needs to find the row by id and hand it back.
grant select, delete on table public.comments to authenticated;

drop policy if exists "Owners can read comments" on public.comments;
create policy "Owners can read comments"
  on public.comments for select
  to authenticated
  using ((select public.is_owner()));

drop policy if exists "Owners can delete comments" on public.comments;
create policy "Owners can delete comments"
  on public.comments for delete
  to authenticated
  using ((select public.is_owner()));
