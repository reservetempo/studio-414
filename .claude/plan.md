# Plan

Managed by the main session (see CLAUDE.md). `/z <items>` adds tasks; `/z` works through them.

## Next

- 14. Make the top-right "Workshops" link a button like "Sign up". Today `.workshop-button` (`workshop.css`, "The button" section; markup in `index.html` around line 121, `#workshop-button` / `.workshop-button__label`) is plain underlined text with a page-colour halo, fixed top right. Turn it into the same raised grey 90s button as the mailing list's `.signup__button` (`styles.css` ~line 503): `--button`/`--button-text` fill, 1px `--dk-shadow` frame, `--bevel-raised` (flips to `--bevel-pressed` with the 1px shift on `:active`), dotted inner focus rectangle. Label in spaced capitals in the display font like "SIGN UP" (uppercase, `0.2em * --display-tracking` letter-spacing, start padding widened by the trailing tracking so the word stays centred). Drop the underline and text-shadow halo. Keep it fixed top right with its current gutters, `hidden` handling, and a finger-sized target. It sits on the photo/page, so make sure it reads there (a ring outside it on focus is fine). Re-size the corner the 414 keeps clear (`--workshop-reach`, `--workshop-drop` at the top of `workshop.css`; the "Opening soon!" counterpart comment in `index.html` ~line 41) to fit the bigger button, including the widest font. Leave "Opening soon!" as plain text. Update the comments in `workshop.css` and `index.html` that call it plain text.


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
- 11. Workshops opens on the calendar with a list of links: `582fec4`. One "Workshops" window: month calendar, then blue underlined links ("Paint a piece, Sat 7 Nov") with spots left in plain text. `#calendar` dialog and "See in calendar" removed; sign-up's "All workshops" returns here. Links are buttons styled as links; "visited" (purple) lasts until reload.
- 12. Each window can carry its own font and colour (CSS): `61beaff`. `[data-color="N"]`/`[data-font="N"]` now work on any element; colour 0 and font 1 got explicit rules; derived button/bevel/sunken tokens re-declared on `[data-color]`; page-level tokens stay on `<html>`.
- 13. Display: pick a part, then its font and colour: `a9f1087`. Part row (Everything, Mailing list, Comments, Workshops, Display); window parts default to "Same as everything" and are stored as `studio414.style.<part>.font`/`.color` (not in the URL); Styles "Reset" row; inline script at the end of `<body>` applies window choices before first paint.
