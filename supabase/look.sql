-- Studio 414 look: the theme and the colour of the whole site (the public site and the
-- owner page), as the owners pick them on the owner page.
--
-- Run once in the Supabase dashboard, after wallpaper.sql (it makes public.site_settings,
-- who may read it and who may change it): SQL Editor -> New query -> paste -> Run. It is
-- safe to run again (it replaces what already exists).
--
-- The look is the row with key 'look' in public.site_settings:
--
--   { "theme": "aqua", "color": 0 }
--
--   theme   one of the six themes (see themes/README.md):
--             aqua     Aqua (the site as it was first made; no theme file)
--             win98    Windows 98
--             system6  Mac System 6
--             nes      NES
--             psone    PlayStation
--             dos      DOS
--   color   a whole number from 0 to 20: 0 "Classic" (aqua.css), 1 to 20 the colours
--           in colors.css. Set as data-color on <html>.
--
-- A look value of any other shape (other keys, another theme, a colour outside 0-20 or
-- not whole) is refused (constraint site_settings_look_shape). Until a look row exists,
-- both pages show Aqua in Classic.
--
-- Both pages read it with the publishable key (no sign-in needed), in look.js:
--
--   GET https://cgbqzdhjhquprjgtcmwh.supabase.co/rest/v1/site_settings?key=eq.look&select=value
--       headers: apikey: <publishable key>
--   -> [ { "value": { "theme": "nes", "color": 6 } } ]
--      or [] when no look has been saved yet.
--
-- The owner page saves it as the signed-in owner, for example with supabase-js:
--
--   client.from('site_settings').upsert({ key: 'look', value: { theme: 'nes', color: 6 } })
--
-- and removing the row puts the site back to Aqua in Classic.

-- The look's shape (replaced on every run, so changes here apply when it's run again).
-- The CASEs check the JSON types first, so nothing below fails on bad input (removing
-- keys from a value that isn't an object, or the number cast): a wrong shape is simply
-- refused. value - 'theme' - 'color' is what is left once both keys are taken out,
-- which must be nothing.
alter table public.site_settings drop constraint if exists site_settings_look_shape;
alter table public.site_settings add constraint site_settings_look_shape check (
  key <> 'look' or (
    case
      when jsonb_typeof(value) = 'object' then
        case
          when jsonb_typeof(value -> 'theme') = 'string'
           and jsonb_typeof(value -> 'color') = 'number'
           and value - 'theme' - 'color' = '{}'::jsonb
           and (value ->> 'color') ~ '^(0|[1-9][0-9]?)$'
          then
                (value ->> 'theme') in ('aqua', 'win98', 'system6', 'nes', 'psone', 'dos')
            and (value ->> 'color')::integer between 0 and 20
          else false
        end
      else false
    end
  )
);

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
