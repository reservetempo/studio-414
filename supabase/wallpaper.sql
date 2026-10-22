-- Studio 414 wallpaper: site settings the owners change from the owner page, starting
-- with the wallpaper photo behind the public site.
--
-- Run once in the Supabase dashboard, after owners.sql (it uses public.is_owner()):
-- SQL Editor -> New query -> paste -> Run. It is safe to run again (it skips or
-- replaces what already exists).
--
-- public.site_settings holds one row per setting: a key and a JSON value. Anyone can
-- read the settings (the public site does, with its publishable key); only owners
-- signed in on admin.html can add, change or remove them (is_owner(), see owners.sql).
-- updated_at is set by the database whenever a row is added or changed.
--
-- The wallpaper is the row with key 'wallpaper':
--
--   { "url": "https://res.cloudinary.com/<cloud name>/image/upload/v.../studio-414/wallpaper/....jpg",
--     "width": 2462, "height": 1920,
--     "spot": { "cx": 0.5, "bottom": 0.4583, "w": 0.3184, "h": 0.0964 } }
--
--   url     the photo's secure_url from Cloudinary's upload reply. It must be an https
--           Cloudinary image URL made only of letters, digits and _ . , / - (at most
--           500 characters), because the public site puts it straight into its CSS.
--   width   the photo's size in pixels (Cloudinary's reply has both); positive numbers.
--   height
--   spot    where the mailing-list card sits on the photo, as fractions of the photo's
--           width (cx, w) and height (bottom, h), the same as --window-cx,
--           --window-bottom, --window-w and --window-h at the top of styles.css:
--             cx      the card's centre, from the photo's left edge (0 to 1)
--             bottom  the card's bottom edge, from the photo's top edge (0 to 1)
--             w       the card's width (more than 0, up to 1)
--             h       the card's height (more than 0, up to 1)
--           The photo the site has now would be cx 0.5, bottom 0.4583, w 0.3184,
--           h 0.0964 on a 2462 x 1920 photo.
--
-- A wallpaper value of any other shape is refused (constraint site_settings_wallpaper_shape).
-- Until a wallpaper row exists, the public site should keep the photo in its own files.
--
-- The public site reads it with its publishable key (no sign-in needed):
--
--   GET https://cgbqzdhjhquprjgtcmwh.supabase.co/rest/v1/site_settings?key=eq.wallpaper&select=value
--       headers: apikey: <publishable key>
--   -> [ { "value": { "url": "...", "width": 2462, "height": 1920, "spot": { ... } } } ]
--      or [] when no wallpaper has been saved yet.
--
-- The owner page saves it as the signed-in owner, for example with supabase-js:
--
--   client.from('site_settings').upsert({ key: 'wallpaper', value: { url, width, height, spot } })

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- The wallpaper's shape (replaced on every run, so changes here apply when it's run again).
-- CASE checks the JSON types first, so the number casts below never fail on bad input:
-- a wrong shape is simply refused.
alter table public.site_settings drop constraint if exists site_settings_wallpaper_shape;
alter table public.site_settings add constraint site_settings_wallpaper_shape check (
  key <> 'wallpaper' or (
    case
      when jsonb_typeof(value) = 'object'
       and jsonb_typeof(value -> 'url') = 'string'
       and jsonb_typeof(value -> 'width') = 'number'
       and jsonb_typeof(value -> 'height') = 'number'
       and jsonb_typeof(value -> 'spot') = 'object'
       and jsonb_typeof(value #> '{spot,cx}') = 'number'
       and jsonb_typeof(value #> '{spot,bottom}') = 'number'
       and jsonb_typeof(value #> '{spot,w}') = 'number'
       and jsonb_typeof(value #> '{spot,h}') = 'number'
      then
            length(value ->> 'url') <= 500
        and (value ->> 'url') ~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/[A-Za-z0-9_.,/-]+$'
        and (value ->> 'width')::numeric > 0
        and (value ->> 'height')::numeric > 0
        and (value #>> '{spot,cx}')::numeric between 0 and 1
        and (value #>> '{spot,bottom}')::numeric between 0 and 1
        and (value #>> '{spot,w}')::numeric > 0 and (value #>> '{spot,w}')::numeric <= 1
        and (value #>> '{spot,h}')::numeric > 0 and (value #>> '{spot,h}')::numeric <= 1
      else false
    end
  )
);

-- Keep updated_at current: the database sets it on every insert and update, whatever
-- the request sends.
create or replace function public.site_settings_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before insert or update on public.site_settings
  for each row execute function public.site_settings_set_updated_at();

alter table public.site_settings enable row level security;

-- Start from nothing (Supabase gives anon and authenticated everything on new tables),
-- then allow reading to all and changes to signed-in accounts. The policies below
-- narrow changes down to owners.
revoke all on table public.site_settings from anon, authenticated;
grant select on table public.site_settings to anon, authenticated;
grant insert, update, delete on table public.site_settings to authenticated;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Owners can add site settings" on public.site_settings;
create policy "Owners can add site settings"
  on public.site_settings for insert
  to authenticated
  with check (public.is_owner());

drop policy if exists "Owners can change site settings" on public.site_settings;
create policy "Owners can change site settings"
  on public.site_settings for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "Owners can remove site settings" on public.site_settings;
create policy "Owners can remove site settings"
  on public.site_settings for delete
  to authenticated
  using (public.is_owner());

-- Let the API see the new table straight away.
notify pgrst, 'reload schema';
