# Plan

Managed by the main session (see CLAUDE.md). `/z <items>` adds tasks; `/z` works through them.

## Next

### 6. Sign-up form: name, "buying for a friend", and × N spots (user's step 4)
- Goal: the workshop sign-up form gets:
  - a required name field;
  - a "Buying for a friend" checkbox that shows one extra "Friend's name" field (required while ticked). The user chose: a single friend field, independent of the spot count;
  - "× 1" beside the price, with buttons to go up and down (1 to the spots left), so several spots can be bought in one order. Make it clear what the total will be.
- Files: `workshop.js`, `workshop.css`.
- POST sends name, quantity and friend's name as documented at the top of `supabase/functions/workshop-checkout/index.ts`.
- Show `409 not_enough_spots` (it includes `remaining`) helpfully. Once sign-ups work end to end, remove the README "Still to do" note saying the front end isn't wired to the new API yet.
- Done when: previewed: the fields show, hide and validate as described, and the count steps within its limits.

### 7. Flashing "Opening soon" sign with butterflies (user's step 5)
- Goal: a flashing "Opening soon" sign with butterflies at the top left of the page, in the site's 90s style.
- Files: `index.html`, `styles.css` (or a small new CSS file).
- Check what's already at the top left (switcher, boxes, other fixed elements) and don't cover it. Works at phone width. With `prefers-reduced-motion`, nothing flashes or flutters.
- Done when: previewed on desktop and at phone width.

### 8. "Email us" link under the mailing list form (user's step 6)
- Goal: a small "Email us" link at the bottom left of the mailing list form, going to `mailto:plazastudioceramique@gmail.com`.
- Files: `index.html`, `styles.css`.
- Done when: previewed: the link sits at the bottom left of the form and opens a mail to that address.

### 9. Fix the stale font-list comment in fonts.css
- Goal: the comment at the top of `fonts.css` says "See README.md for the list", but the README no longer lists the fonts. Make the comment accurate (e.g. say where the list lives, in `fonts.css`/`switcher.js`), without changing any CSS.
- Files: `fonts.css`.
- Done when: the comment is accurate. Nothing visible changes, so no preview needed.

## Done

- 1. Add 10 Velvetyne fonts to the font switcher: `34558eb`. Fonts 11-20: Anthony, Victorianna (Thin), Gulax, BackOut, Bluu Next (Bold), Daubenton, Grotesk, Kaeru Kaeru, Format 1452, Flor de Ruina. The font range is now 0-20; colours still 0-10.
- 2. Add 10 color options to the color switcher: `f7ffc9b`. Colours 11-20: Oxblood, Tangerine, Umber, Olive, Turquoise, Teal, Ultraviolet, Hot Pink, Porcelain, Raku. Colour range is now 0-20.
- 3. Back end for several workshops, spot counts and names: `c2e148f`. GET `{ workshops: [...] }`; POST `{ workshop, email, name, quantity, friendName? }`; API documented at the top of `workshop-checkout/index.ts`. Assumes Eastern time (`America/Toronto`). Not type-checked with Deno (not installed); SQL not run.
- 4. Workshops list window: `100b454`. Button reads "Workshops", opens a list; each workshop opens its own sign-up with "All workshops" to go back. Workshop list kept in `workshop.js`; paid workshop id kept in `sessionStorage` for the Stripe return message.
- 5. "See in calendar" month view: `b236d84`. New `calendar.js`/`calendar.css` and `<dialog id="calendar">`; `workshop.js` exposes `window.studioWorkshops`. Week starts on Sunday.
