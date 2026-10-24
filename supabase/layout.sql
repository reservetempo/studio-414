-- Studio 414 site layout: how the owners arranged the public site on the preview page
-- (the photo's size, and where the mailing-list card and the big 414 start), which is
-- every visitor's starting layout.
--
-- Run once in the Supabase dashboard, after wallpaper.sql (it makes public.site_settings,
-- who may read it and who may change it): SQL Editor -> New query -> paste -> Run. It is
-- safe to run again (it replaces what already exists).
--
-- The layout is the row with key 'layout' in public.site_settings. Every part is
-- optional ({} is the same as no row, and a part left out keeps the CSS layout):
--
--   {
--     "photo":  { "scale": 0.8 },
--     "card":   { "x": 0.34, "y": 0.86, "w": 0.32, "h": 0.3 },
--     "big414": { "x": 0.18, "y": -0.2, "w": 0.64 }
--   }
--
--   photo.scale  the photo's width as a share of the hero's width, 0.25 to 2 (1 is the
--                full width, as the site has it without a layout)
--   card         the mailing-list card: top-left corner x, y and size w, h
--   big414       the big 414: top-left corner x, y and width w (its height follows)
--   x and y      -10 to 10;  w and h  above 0, up to 10
--
-- x, y, w and h are fractions of the visible photo (the photo clipped to the first
-- screen): x and w of its width, y and h of its height. layout.js, at the top, says
-- exactly how they are turned into places on the page.
--
-- A layout value of any other shape (other keys, a part that is not an object or is
-- missing one of its numbers, a number out of range) is refused (constraint
-- site_settings_layout_shape). Until a layout row exists, the site shows the layout
-- its CSS gives it.
--
-- The public site reads it with the publishable key (no sign-in needed), in layout.js:
--
--   GET https://cgbqzdhjhquprjgtcmwh.supabase.co/rest/v1/site_settings?key=eq.layout&select=value
--       headers: apikey: <publishable key>
--   -> [ { "value": { "photo": { "scale": 0.8 } } } ]
--      or [] when no layout has been saved yet.
--
-- The preview page saves it as the signed-in owner, for example with supabase-js:
--
--   client.from('site_settings').upsert({ key: 'layout', value: { photo: { scale: 0.8 } } })
--
-- and removing the row puts the site back to its CSS layout.

-- The layout's shape (replaced on every run, so changes here apply when it's run again).
-- The CASEs check the JSON types before anything that needs them (removing keys from an
-- object, the number casts), and their branches run in order, so nothing below fails on
-- bad input: a wrong shape is simply refused. value - 'photo' - 'card' - 'big414' is what
-- is left once the three parts are taken out, which must be nothing; the same goes for
-- each part's own keys. #> returns null for a path that isn't there: the type checks
-- use = 'number' (or is distinct from), so a missing number ends in false, not null.
alter table public.site_settings drop constraint if exists site_settings_layout_shape;
alter table public.site_settings add constraint site_settings_layout_shape check (
  key <> 'layout' or (
    case
      when jsonb_typeof(value) is distinct from 'object' then false
      when value - 'photo' - 'card' - 'big414' <> '{}'::jsonb then false
      else
        -- photo: { scale }, 0.25 to 2
        (case
          when not (value ? 'photo') then true
          when jsonb_typeof(value -> 'photo') is distinct from 'object' then false
          when (value -> 'photo') - 'scale' <> '{}'::jsonb then false
          when jsonb_typeof(value #> '{photo,scale}') = 'number'
          then (value #>> '{photo,scale}')::numeric between 0.25 and 2
          else false
        end)
        -- card: { x, y, w, h }
        and (case
          when not (value ? 'card') then true
          when jsonb_typeof(value -> 'card') is distinct from 'object' then false
          when (value -> 'card') - 'x' - 'y' - 'w' - 'h' <> '{}'::jsonb then false
          else
                (case when jsonb_typeof(value #> '{card,x}') = 'number'
                      then (value #>> '{card,x}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{card,y}') = 'number'
                      then (value #>> '{card,y}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{card,w}') = 'number'
                      then (value #>> '{card,w}')::numeric > 0
                       and (value #>> '{card,w}')::numeric <= 10 else false end)
            and (case when jsonb_typeof(value #> '{card,h}') = 'number'
                      then (value #>> '{card,h}')::numeric > 0
                       and (value #>> '{card,h}')::numeric <= 10 else false end)
        end)
        -- big414: { x, y, w }
        and (case
          when not (value ? 'big414') then true
          when jsonb_typeof(value -> 'big414') is distinct from 'object' then false
          when (value -> 'big414') - 'x' - 'y' - 'w' <> '{}'::jsonb then false
          else
                (case when jsonb_typeof(value #> '{big414,x}') = 'number'
                      then (value #>> '{big414,x}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{big414,y}') = 'number'
                      then (value #>> '{big414,y}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{big414,w}') = 'number'
                      then (value #>> '{big414,w}')::numeric > 0
                       and (value #>> '{big414,w}')::numeric <= 10 else false end)
        end)
    end
  )
);

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
