-- Studio 414 workshop sign-ups: table, privileges, Row Level Security and the two
-- functions the workshop-checkout edge function calls.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it skips or replaces what already exists).
--
-- Sign-ups hold people's names and email addresses, so nothing here is reachable with
-- the public anon / publishable key: Row Level Security is on with no policies, and
-- the anon and authenticated roles have no privileges on the table or the functions.
-- Only the edge functions, which use the service role key on the server, read and
-- write it. The owner sees sign-ups in the dashboard (Table Editor -> workshop_signups).
--
-- Each row is one order: one email booking `quantity` spots in one workshop (the id
-- from the WORKSHOPS list in supabase/functions/workshop-checkout/index.ts), under
-- `name`, with an optional `friend_name` for whoever comes along.
--
-- A row's status:
--   pending  someone is in Stripe Checkout; its spots are held until expires_at
--   paid     Stripe confirmed the payment (set by the stripe-webhook function)
--   expired  the checkout was abandoned or timed out; its spots are free again

create table if not exists public.workshop_signups (
  id                uuid primary key default gen_random_uuid(),
  workshop          text not null
                    constraint workshop_signups_workshop_length check (char_length(workshop) between 1 and 64),
  email             text not null
                    constraint workshop_signups_email_length check (char_length(email) between 3 and 254),
  name              text not null
                    constraint workshop_signups_name_length check (char_length(name) between 1 and 100),
  friend_name       text
                    constraint workshop_signups_friend_name_length check (char_length(friend_name) between 1 and 100),
  quantity          integer not null default 1
                    constraint workshop_signups_quantity_check check (quantity >= 1),
  stripe_session_id text unique,
  status            text not null default 'pending'
                    constraint workshop_signups_status_check check (status in ('pending', 'paid', 'expired')),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  paid_at           timestamptz
);

-- Spots are counted per workshop and status; duplicates are found by email.
create index if not exists workshop_signups_workshop_status_idx
  on public.workshop_signups (workshop, status);
create index if not exists workshop_signups_workshop_email_idx
  on public.workshop_signups (workshop, email);

alter table public.workshop_signups enable row level security;

-- No policies on purpose: with RLS on, anon and authenticated can't see or change any
-- row. Their table privileges are revoked as well (Supabase grants them on new tables
-- by default). The service role bypasses RLS; it is granted explicitly so this works
-- even if the project doesn't grant new tables to the API roles automatically.
revoke all on table public.workshop_signups from anon, authenticated;
grant select, insert, update, delete on table public.workshop_signups to service_role;

-- Spots taken in each of the given workshops: the spots of paid sign-ups, plus those
-- of pending ones still inside their checkout window (so spots held by someone paying
-- right now aren't sold twice). Workshops with nothing taken have no row.
create or replace function public.workshop_taken(p_workshops text[])
returns table (workshop text, taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.workshop, sum(s.quantity)::integer
  from public.workshop_signups as s
  where s.workshop = any (p_workshops)
    and (s.status = 'paid' or (s.status = 'pending' and s.expires_at > now()))
  group by s.workshop;
$$;

-- Holds p_quantity spots for one checkout. Counting and inserting happen under a lock
-- per workshop, so when two people go for the last spots at the same moment, the
-- second waits for the first and then sees them taken.
--
-- Returns {"result": "reserved", "id": "<uuid>"}, {"result": "already_signed_up"},
-- {"result": "full"} or {"result": "not_enough_spots", "remaining": <n>}. The email
-- should already be trimmed and lower-cased, and the names tidied.
create or replace function public.workshop_reserve(
  p_workshop    text,
  p_email       text,
  p_name        text,
  p_friend_name text,
  p_quantity    integer,
  p_capacity    integer,
  p_expires_at  timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
  v_id        uuid;
begin
  -- Held until this transaction (the RPC call) commits.
  perform pg_advisory_xact_lock(hashtext('public.workshop_signups:' || p_workshop));

  if exists (
    select 1
    from public.workshop_signups as s
    where s.workshop = p_workshop
      and s.email = p_email
      and s.status = 'paid'
  ) then
    return jsonb_build_object('result', 'already_signed_up');
  end if;

  select greatest(p_capacity - coalesce(sum(t.taken), 0), 0)::integer
  into v_remaining
  from public.workshop_taken(array[p_workshop]) as t;

  if v_remaining = 0 then
    return jsonb_build_object('result', 'full');
  end if;
  if p_quantity > v_remaining then
    return jsonb_build_object('result', 'not_enough_spots', 'remaining', v_remaining);
  end if;

  insert into public.workshop_signups (workshop, email, name, friend_name, quantity, status, expires_at)
  values (p_workshop, p_email, p_name, p_friend_name, p_quantity, 'pending', p_expires_at)
  returning id into v_id;

  return jsonb_build_object('result', 'reserved', 'id', v_id);
end;
$$;

-- Only the service role (the edge functions) may call these. Supabase grants execute
-- on new functions to anon and authenticated by default, and Postgres to public.
revoke all on function public.workshop_taken(text[]) from public, anon, authenticated;
revoke all on function public.workshop_reserve(text, text, text, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.workshop_taken(text[]) to service_role;
grant execute on function public.workshop_reserve(text, text, text, text, integer, integer, timestamptz)
  to service_role;

-- Let the API see the new functions straight away.
notify pgrst, 'reload schema';
