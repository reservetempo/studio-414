# Plan

Managed by the main session (see CLAUDE.md). `/z <items>` adds tasks; `/z` works through them.

## Next

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
- 10. "Opening soon!" and Workshops as plain text: `8d56a8a`. Plain italic "Opening soon!" top left; Workshops a plain underlined button fixed top right; both in the display font with a page-colour halo over the photo. Corner room for the 414 shrunk. Italic is browser-slanted in every font but EB Garamond.
