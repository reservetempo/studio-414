# Plan

Managed by the main session (see CLAUDE.md). `/z <items>` adds tasks; `/z` works through them.

## Next

### 2. Add 10 color options to the color switcher (user's step 1)
- Goal: 10 more good color options in the site's color switcher, alongside the existing ones.
- Files: `switcher.js` and wherever the existing colors are defined (`styles.css` / `switcher.css`). Follow the existing pattern (`?color=` values, names, dark mode if colors have one).
- Each new option must keep text readable (good contrast) and look distinct from the existing ones and from each other.
- Done when: all 10 show up in the switcher and apply when picked (previewed).

### 3. Back end: several workshops, a spot count per order, and names (supports steps 2 and 4)
- Goal: the Supabase/Stripe back end handles more than one workshop, buying several spots in one order, the buyer's name and an optional friend's name.
- Files: `supabase/workshop.sql`, `supabase/functions/workshop-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts` (if needed), `README.md` (setup steps and "Still to do"). Don't change `workshop.js`: tasks 4 and 6 adapt the front end.
- Workshops (ids are up to you; keep them short): "Paint a piece", Saturday 7 November 2026, and "Hand building", Saturday 5 December 2026. Each has 10 spots at $59.99 (CAD, as now).
- GET returns every upcoming workshop with its id, name, date, price, capacity, taken and remaining. Taken counts spots, not orders.
- POST takes the workshop id, email, name, quantity (1 to the spots remaining) and an optional friend's name, and sends Stripe Checkout the quantity. Reject past workshops, bad input and full workshops with clear error codes. Keep the existing one-order-per-email-per-workshop rule.
- Nothing is deployed yet, so the SQL can change freely, but it must still run cleanly in the Supabase SQL editor.
- Document the API in the header comment of `workshop-checkout/index.ts` so the front-end tasks can follow it.
- Done when: the functions type-check (`deno check` if Deno is installed; otherwise review carefully) and the README matches.

### 4. Workshops list window (user's step 2)
- Goal: the Workshops button (top right, `#workshop-button`) opens a "Workshops" window listing the upcoming workshops (name, date, spots left). Clicking one opens the sign-up window for that workshop.
- Files: `workshop.js`, `workshop.css`, `index.html` (button label, if needed).
- Use the API documented at the top of `supabase/functions/workshop-checkout/index.ts` (task 3): POST sends the workshop id.
- The functions aren't deployed yet, so names and dates must show even when the API can't be reached: keep the list in `workshop.js`, with ids matching the server's, and a comment in each place pointing to the other. Spots left come from the API when it answers.
- Workshops whose date has passed drop off the list. The button hides when none are left.
- Same 90s window style, dragging, keyboard and screen-reader behaviour as the existing sign-up window. Update the header comment of `workshop.js`.
- Done when: previewed: the list shows both workshops, and each one opens its own sign-up.

### 5. "See in calendar" month view (user's step 3)
- Goal: a "See in calendar" option in the workshops list window opens a small 90s-style window with a month grid.
- The grid starts on the month of the next workshop, with previous/next month buttons. Workshop dates are marked; clicking a marked date opens that workshop's sign-up.
- Files: `workshop.js` and `workshop.css`, or a new `calendar.js`/`calendar.css` (linked from `index.html`) if that keeps things tidier.
- Works with the keyboard and screen readers, and at phone width.
- Done when: previewed: November and December 2026 show their workshops, and clicking one opens its sign-up.

### 6. Sign-up form: name, "buying for a friend", and × N spots (user's step 4)
- Goal: the workshop sign-up form gets:
  - a required name field;
  - a "Buying for a friend" checkbox that shows one extra "Friend's name" field (required while ticked). The user chose: a single friend field, independent of the spot count;
  - "× 1" beside the price, with buttons to go up and down (1 to the spots left), so several spots can be bought in one order. Make it clear what the total will be.
- Files: `workshop.js`, `workshop.css`.
- POST sends name, quantity and friend's name as documented at the top of `supabase/functions/workshop-checkout/index.ts`.
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
