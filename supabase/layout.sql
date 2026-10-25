-- Studio 414 site layout: how the owners arranged the public site on the preview page
-- (the photo's size, where the mailing-list card, the big 414 and the comment section
-- start, the 414's text, and whether the comment section is shown), which is every
-- visitor's starting layout.
--
-- Run once in the Supabase dashboard, after wallpaper.sql (it makes public.site_settings,
-- who may read it and who may change it): SQL Editor -> New query -> paste -> Run. It is
-- safe to run again (it replaces what already exists).
--
-- The layout is the row with key 'layout' in public.site_settings. Every part is
-- optional ({} is the same as no row, and a part left out keeps the CSS layout):
--
--   {
--     "photo":    { "scale": 0.8 },
--     "card":     { "x": 0.34, "y": 0.86, "w": 0.32, "h": 0.3 },
--     "big414":   { "x": 0.18, "y": -0.2, "w": 0.64 },
--     "comments": { "x": 0.6, "y": 0.1, "w": 0.3, "h": 0.5 },
--     "big414Text": "SALE",
--     "commentsHidden": true
--   }
--
--   photo.scale  the photo's width as a share of the hero's width, 0.25 to 2 (1 is the
--                full width, as the site has it without a layout)
--   card         the mailing-list card: top-left corner x, y and size w, h
--   big414       the big 414: top-left corner x, y and width w (its height follows)
--   comments     the comment section where it floats over the first screen: top-left
--                corner x, y and size w, h, exactly like card
--   x and y      -10 to 10;  w and h  above 0, up to 10
--   big414Text   the text shown in place of the big 414 (left out: 414): a string of 1
--                to 20 characters on one line (no control characters U+0000-U+001F or
--                U+007F-U+009F, no U+2028 or U+2029), stored trimmed (no white space at
--                either end: a space, U+00A0, U+1680, U+2000-U+200A, U+202F, U+205F,
--                U+3000 or U+FEFF, which is what JavaScript's trim() removes)
--   commentsHidden  true hides the comment section from visitors (the comments are
--                kept); only true is allowed, and left out means shown
--
-- x, y, w and h are fractions of the visible photo (the photo clipped to the first
-- screen): x and w of its width, y and h of its height. layout.js, at the top, says
-- exactly how they are turned into places on the page.
--
-- A layout value of any other shape (other keys, a part that is not an object or is
-- missing one of its numbers, a number out of range, a big414Text that isn't such a
-- string, a commentsHidden that isn't true) is refused (constraint
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
-- bad input: a wrong shape is simply refused. value - 'photo' - ... - 'commentsHidden' is
-- what is left once the six known keys are taken out, which must be nothing; the same
-- goes for each part's own keys. #> returns null for a path that isn't there: the type
-- checks use = 'number' (or is distinct from), so a missing number ends in false, not
-- null. The checks on big414Text are the ones valid() in layout.js makes: char_length
-- counts code points, as valid() does (jsonb holds no lone surrogates and no U+0000, so
-- the ranges start at U+0001), and the regular expressions use \uXXXX escapes, which
-- reach the regex engine as written because standard_conforming_strings is on.
alter table public.site_settings drop constraint if exists site_settings_layout_shape;
alter table public.site_settings add constraint site_settings_layout_shape check (
  key <> 'layout' or (
    case
      when jsonb_typeof(value) is distinct from 'object' then false
      when value - 'photo' - 'card' - 'big414' - 'comments' - 'big414Text' - 'commentsHidden'
           <> '{}'::jsonb then false
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
        -- comments: { x, y, w, h }, like card
        and (case
          when not (value ? 'comments') then true
          when jsonb_typeof(value -> 'comments') is distinct from 'object' then false
          when (value -> 'comments') - 'x' - 'y' - 'w' - 'h' <> '{}'::jsonb then false
          else
                (case when jsonb_typeof(value #> '{comments,x}') = 'number'
                      then (value #>> '{comments,x}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{comments,y}') = 'number'
                      then (value #>> '{comments,y}')::numeric between -10 and 10 else false end)
            and (case when jsonb_typeof(value #> '{comments,w}') = 'number'
                      then (value #>> '{comments,w}')::numeric > 0
                       and (value #>> '{comments,w}')::numeric <= 10 else false end)
            and (case when jsonb_typeof(value #> '{comments,h}') = 'number'
                      then (value #>> '{comments,h}')::numeric > 0
                       and (value #>> '{comments,h}')::numeric <= 10 else false end)
        end)
        -- big414Text: 1 to 20 characters, one line, no control characters, trimmed
        and (case
          when not (value ? 'big414Text') then true
          when jsonb_typeof(value -> 'big414Text') is distinct from 'string' then false
          else
                char_length(value ->> 'big414Text') between 1 and 20
            and (value ->> 'big414Text') !~ '[\u0001-\u001f\u007f-\u009f\u2028\u2029]'
            and (value ->> 'big414Text') !~ '^[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]'
            and (value ->> 'big414Text') !~ '[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]$'
        end)
        -- commentsHidden: true only
        and (case
          when not (value ? 'commentsHidden') then true
          else (value -> 'commentsHidden') = 'true'::jsonb
        end)
    end
  )
);

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
