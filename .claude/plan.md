# Plan

Managed by the main session (see CLAUDE.md). `/z <items>` adds tasks; `/z` works through them.

## Next

- 10. Make "Opening soon" and the Workshops button quiet. Files: `index.html` (the `.opening-soon` paragraph near the top of `<body>`, and `#workshop-button` around line 126), `opening-soon.css`, `workshop.css` (the `.workshop-button*` rules and `--workshop-reach`/`--workshop-drop`), `styles.css` (`--corner-w`/`--corner-h` around line 237 use `--opening-reach`/`--opening-drop` and `--workshop-reach`/`--workshop-drop` to keep the big 414 out of both corners), `workshop.js` only if needed (it shows/hides `#workshop-button`, sets its label to "Sold out"/"Workshops" via `#workshop-button-label`, and sets `data-state="soldout"`).
  - Opening soon: plain italic text reading exactly "Opening soon!" in the same top-left spot (still inside the hero, scrolls away with the photo). Remove the marquee frame, chasing bulbs, flashing and all three butterflies (markup and CSS). It follows the style switcher's current font and colour like the rest of the page.
  - Workshops: a plain underlined text link-look at the top right, still fixed on screen while scrolling. Remove the raised button look, the "New!" burst and both stars (markup and CSS). Keep it a `<button>` (it opens a dialog) and keep its id, aria attributes, the hidden-until-JS behaviour and the "Sold out" label; it follows the switcher's font and colour. Keep a visible focus style.
  - Shrink `--opening-reach`/`--opening-drop` and `--workshop-reach`/`--workshop-drop` to fit the smaller text so the 414 gets its room back, and update the comments that describe the old sign/button (index.html, opening-soon.css, workshop.css headers).
  - Done: both look plain on desktop and phone width, nothing flashes, the 414 doesn't overlap either, the Workshops link still opens the Workshops window.
- 11. Workshops link opens the calendar directly, with a list of links under it. Files: `index.html` (dialogs `#workshops` ~line 137, `#workshop` sign-up ~161, `#calendar` ~245), `workshop.js` (builds the list window `#workshops`/`#workshops-list`, the launcher `#workshop-button`, the sign-up's "All workshops" back button, exposes `window.studioWorkshops`, `makeWindow`), `calendar.js` (month grid; opener is `#workshops-calendar` "See in calendar"; `#calendar-back` "All workshops"), `calendar.css`, `workshop.css`. Depends on task 10 (same files), so run after it.
  - Clicking Workshops opens the calendar window straight away (title "Workshops"), starting on the month of the next workshop as now. Day buttons in the grid still open that workshop's sign-up.
  - Under the calendar, a simple list with one link per workshop coming up: underlined, classic web blue `#0000EE`, visited `#551A8B`, always (not following the colour switcher). Link text is name and date, e.g. "Paint a piece, Sat 7 Nov"; spots left / "Sold out" in plain text after the link (as the list window shows now). Each opens that workshop's sign-up.
  - Remove the separate Workshops list window and its "See in calendar" button, and the calendar's "All workshops" back button. The sign-up window's "All workshops" back button now returns to the calendar window. Only one window open at a time, as now.
  - Update the header comments in `workshop.js`, `calendar.js` and the dialog comments in `index.html` to match.
  - Done: Workshops → calendar with links below; a link or a marked day → sign-up; "All workshops" → back to the calendar; works at phone width; the Stripe return message still works.

## Done

- 1. Add 10 Velvetyne fonts to the font switcher: `34558eb`. Fonts 11-20: Anthony, Victorianna (Thin), Gulax, BackOut, Bluu Next (Bold), Daubenton, Grotesk, Kaeru Kaeru, Format 1452, Flor de Ruina. The font range is now 0-20; colours still 0-10.
- 2. Add 10 color options to the color switcher: `f7ffc9b`. Colours 11-20: Oxblood, Tangerine, Umber, Olive, Turquoise, Teal, Ultraviolet, Hot Pink, Porcelain, Raku. Colour range is now 0-20.
- 3. Back end for several workshops, spot counts and names: `c2e148f`. GET `{ workshops: [...] }`; POST `{ workshop, email, name, quantity, friendName? }`; API documented at the top of `workshop-checkout/index.ts`. Assumes Eastern time (`America/Toronto`). Not type-checked with Deno (not installed); SQL not run.
- 4. Workshops list window: `100b454`. Button reads "Workshops", opens a list; each workshop opens its own sign-up with "All workshops" to go back. Workshop list kept in `workshop.js`; paid workshop id kept in `sessionStorage` for the Stripe return message.
- 5. "See in calendar" month view: `b236d84`. New `calendar.js`/`calendar.css` and `<dialog id="calendar">`; `workshop.js` exposes `window.studioWorkshops`. Week starts on Sunday.
- 6. Sign-up form: name, "buying for a friend", and x N spots: `bd3dd16`. Pay button shows the total; typed values are kept between openings, the count resets to x 1.
- 7. Flashing "Opening soon" sign with butterflies: `3d6f4c9`. Marquee sign in `opening-soon.css`, inside the hero (scrolls away with the photo, not fixed); the 414 avoids its corner; reduced motion stops all animation.
- 8. "Email us" link under the mailing list form: `b3df5c3`. Small link at the bottom left of the form (`.signup__email`).
- 9. Fix the stale font-list comment in fonts.css: `96e3f1d`.
