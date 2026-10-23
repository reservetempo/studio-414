-- Studio 414 workshops: the workshops people can sign up for, which the owners add and
-- edit on the owner page, plus owner-only access to the sign-ups.
--
-- Run in the Supabase dashboard after owners.sql (it uses public.is_owner()) and
-- workshop.sql (it uses public.workshop_signups and public.workshop_taken()):
-- SQL Editor -> New query -> paste -> Run. It is safe to run again (it skips or
-- replaces what already exists). If you ever run workshop.sql again, run this file
-- again afterwards: workshop.sql takes back the owners' read access to the sign-ups.
--
-- public.workshops holds one row per workshop:
--
--   id           its id, stored with each sign-up (workshop_signups.workshop); spots
--                are counted by it. Lower-case letters and digits in groups joined by
--                single hyphens ("paint-a-piece"), at most 64 characters. It can't be
--                changed once the workshop exists.
--   name         1 to 100 characters (spaces at either end are trimmed)
--   date         the day of the workshop, in the studio's time zone (America/Toronto,
--                STUDIO_TIME_ZONE in the workshop-checkout function). It is listed and
--                bookable until that day has ended there.
--   start_time   optional times of day, studio time; end_time only with a start_time,
--   end_time     and later than it. Shown as "HH:MM" (24-hour clock).
--   description  optional, up to 2000 characters (trimmed; blank becomes null)
--   capacity     spots, 1 to 500. It can't go below the spots already taken.
--   price_cents  per spot, in cents (Canadian dollars): 50 ($0.50, Stripe's smallest
--                charge) to 1000000 ($10,000)
--   hidden       true keeps it off the site and out of checkout (sign-ups are kept)
--   created_at   set by the database
--   updated_at   set by the database on every change
--
-- Who can do what (Row Level Security):
--   anyone (the public site, the publishable key)  see workshops that aren't hidden
--   owners signed in on admin.html (is_owner())     see, add, change and delete all of
--                                                   them, and see every sign-up
--   the edge functions (service role)               everything, as before
--
-- Deleting a workshop is refused while it has paid sign-ups (hide it instead) or while
-- someone is in Stripe Checkout for it (spots held, not yet expired). Otherwise it is
-- deleted and its leftover sign-ups (expired or lapsed checkouts) stay in
-- workshop_signups. They don't count as taken spots, so a later workshop with the same
-- id starts with all its spots free.
--
-- Spots taken are counted as workshop_taken() in workshop.sql counts them: the spots
-- of paid sign-ups plus those of pending ones still inside their checkout window.
-- workshop_spots_taken() below gives owners both numbers for every workshop.

create table if not exists public.workshops (
  id          text primary key
              constraint workshops_id_format check (
                char_length(id) between 1 and 64 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
              ),
  name        text not null
              constraint workshops_name_length check (char_length(name) between 1 and 100),
  date        date not null,
  start_time  time,
  end_time    time,
  description text
              constraint workshops_description_length check (char_length(description) between 1 and 2000),
  capacity    integer not null
              constraint workshops_capacity_range check (capacity between 1 and 500),
  price_cents integer not null
              constraint workshops_price_range check (price_cents between 50 and 1000000),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 24:00 is a valid Postgres time; keep both times within the day.
  constraint workshops_times_check check (
    (start_time is null or start_time < '24:00')
    and (end_time is null or (start_time is not null and end_time > start_time and end_time < '24:00'))
  )
);

-- Before every insert and update: tidy the text, keep id and created_at fixed, set
-- updated_at, and refuse a capacity below the spots already taken. Runs as the table
-- owner so it can count sign-ups whoever makes the change.
create or replace function public.workshops_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_capacity boolean;
  v_taken          integer;
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(new.description), '');

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception using
        errcode = 'check_violation',
        message = 'A workshop''s id can''t be changed: its sign-ups are stored under it.',
        hint = 'Add a new workshop instead, and hide or delete this one.';
    end if;
    new.created_at := old.created_at;
    v_check_capacity := new.capacity < old.capacity;
  else
    new.created_at := now();
    v_check_capacity := true;
  end if;
  new.updated_at := now();

  if v_check_capacity then
    -- The same lock workshop_reserve() takes, so spots being held at this moment are
    -- counted. (workshop-checkout reads the capacity just before it reserves, so a
    -- checkout started in the very same instant can still go by the old capacity.)
    perform pg_advisory_xact_lock(hashtext('public.workshop_signups:' || new.id));

    select coalesce(sum(t.taken), 0)::integer
    into v_taken
    from public.workshop_taken(array[new.id]) as t;

    if new.capacity < v_taken then
      raise exception using
        errcode = 'check_violation',
        message = format(
          'Spots already taken: %s (paid, or held while someone pays). The workshop needs at least that many spots.',
          v_taken
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists workshops_before_write on public.workshops;
create trigger workshops_before_write
  before insert or update on public.workshops
  for each row execute function public.workshops_before_write();

-- Before a delete: refuse while the workshop has paid sign-ups or spots held for a
-- checkout in progress. Leftover expired / lapsed sign-ups are left as they are.
create or replace function public.workshops_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.workshop_signups:' || old.id));

  if exists (
    select 1 from public.workshop_signups as s
    where s.workshop = old.id and s.status = 'paid'
  ) then
    raise exception using
      errcode = 'restrict_violation',
      message = 'This workshop has paid sign-ups, so it can''t be deleted.',
      hint = 'Hide it instead: it stays off the site and its sign-ups are kept.';
  end if;

  if exists (
    select 1 from public.workshop_signups as s
    where s.workshop = old.id and s.status = 'pending' and s.expires_at > now()
  ) then
    raise exception using
      errcode = 'restrict_violation',
      message = 'Someone is paying for this workshop right now, so it can''t be deleted yet.',
      hint = 'Hide it, then try again in about half an hour.';
  end if;

  return old;
end;
$$;

drop trigger if exists workshops_before_delete on public.workshops;
create trigger workshops_before_delete
  before delete on public.workshops
  for each row execute function public.workshops_before_delete();

-- Trigger functions can't be called directly anyway; this just keeps them off the API.
revoke all on function public.workshops_before_write() from public, anon, authenticated;
revoke all on function public.workshops_before_delete() from public, anon, authenticated;

alter table public.workshops enable row level security;

-- Start from nothing (Supabase gives anon and authenticated everything on new tables),
-- then allow reading to all and changes to signed-in accounts. The policies below
-- narrow it down: hidden workshops and all changes are for owners only.
revoke all on table public.workshops from anon, authenticated;
grant select on table public.workshops to anon, authenticated;
grant insert, update, delete on table public.workshops to authenticated;
grant select, insert, update, delete on table public.workshops to service_role;

drop policy if exists "Anyone can see listed workshops" on public.workshops;
create policy "Anyone can see listed workshops"
  on public.workshops for select
  to anon, authenticated
  using (not hidden);

drop policy if exists "Owners can see all workshops" on public.workshops;
create policy "Owners can see all workshops"
  on public.workshops for select
  to authenticated
  using ((select public.is_owner()));

drop policy if exists "Owners can add workshops" on public.workshops;
create policy "Owners can add workshops"
  on public.workshops for insert
  to authenticated
  with check ((select public.is_owner()));

drop policy if exists "Owners can change workshops" on public.workshops;
create policy "Owners can change workshops"
  on public.workshops for update
  to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "Owners can delete workshops" on public.workshops;
create policy "Owners can delete workshops"
  on public.workshops for delete
  to authenticated
  using ((select public.is_owner()));

-- The two workshops that used to be listed in the workshop-checkout function. Times
-- and descriptions are left for the owners to fill in.
insert into public.workshops (id, name, date, capacity, price_cents)
values
  ('paint-a-piece', 'Paint a piece', '2026-11-07', 10, 5999),
  ('hand-building', 'Hand building', '2026-12-05', 10, 5999)
on conflict (id) do nothing;

-- Owners can read every sign-up (names and emails included) from the owner page.
-- Nobody else can: anon has no privileges, and for other signed-in accounts this is
-- the only policy, so they see no rows. Changes stay with the edge functions.
grant select on table public.workshop_signups to authenticated;

drop policy if exists "Owners can see sign-ups" on public.workshop_signups;
create policy "Owners can see sign-ups"
  on public.workshop_signups for select
  to authenticated
  using ((select public.is_owner()));

-- For the owner page: spots taken in every workshop in the table, soonest first, as
-- paid_spots (paid sign-ups) and held_spots (checkouts in progress, not yet expired).
-- Their sum is what counts against capacity. Workshops with nothing taken get zeros.
-- Owners only: anyone else gets an error.
--
--   const { data, error } = await supabase.rpc("workshop_spots_taken");
--   // [{ workshop: "paint-a-piece", paid_spots: 3, held_spots: 1 }, ...]
create or replace function public.workshop_spots_taken()
returns table (workshop text, paid_spots integer, held_spots integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'Only the studio''s owners can see spots taken.';
  end if;

  return query
  select
    w.id,
    coalesce(sum(s.quantity) filter (where s.status = 'paid'), 0)::integer,
    coalesce(sum(s.quantity) filter (where s.status = 'pending' and s.expires_at > now()), 0)::integer
  from public.workshops as w
  left join public.workshop_signups as s on s.workshop = w.id
  group by w.id
  order by w.date, w.id;
end;
$$;

revoke all on function public.workshop_spots_taken() from public, anon;
grant execute on function public.workshop_spots_taken() to authenticated;

-- Let the API see the new table and function straight away.
notify pgrst, 'reload schema';
