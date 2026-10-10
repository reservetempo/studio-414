# Studio 414

A one-page site for Studio 414, an empty white-walled studio space: a photo hero with a giant "414", a mailing-list sign-up and a small comment section, each in a simple 90s-style window that visitors can drag and resize, and a third window for trying out fonts and colours.

## Run it locally

Plain HTML, CSS and JavaScript, with no build step. From this folder:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## The page and the big 414

The page itself is the selected colour (see [Colours](#colours)): the background, the bands above and below the photo on screens narrower than it, and the fades where the photo's edges melt into them. Only the photo is darkened; the bands are exactly the colour. The photo's bottom edge always fades into the colour, also on wide screens where the photo runs past the bottom of the screen, so the page below carries straight on.

Over the photo hangs a giant **414**, the studio's name, like the digits on a "page not found" page. It is the page's `<h1>` (it reads "Studio 414" to screen readers), set in the same colour and in the selected display font, so it changes with both switches (EB Garamond is set in its 800 weight for it, which Google serves from the same file as the other weights). It sits centred above the window in the photo, like a sign over it, clear of the window and of the windows' default places:

- where the comments box floats on the right wall, it is as wide as the photo's window;
- elsewhere it is up to 80% of the photo's width, and on screens narrower than the photo the digits rise a little out of the band of colour above it into the photo;
- it is fitted to that room in every font (each face's "414" is measured in [`fonts.css`](fonts.css)), never causes sideways scrolling, and is decoration for the pointer: drags and clicks pass straight through it, and the windows always sit on top of it.

Being the page colour, it would disappear into the darkened photo for most colours, so each digit is edged in the colour's title-bar text colour (white or black, as on the title bars): at least 3.3:1 against the photo behind it and 6:1 against the digit. On short screens where the Display window opens at the top, the 414 moves aside so the two never overlap.

## The boxes

The mailing-list card, the comment section and the Display window (the font and colour switcher) are drawn as classic Windows 95/98-style dialog windows: a black frame with a 2px bevel, a solid face, a title bar with a small pixel icon, sunken white fields, square buttons that press in, and, on the first two, a resize grip in the bottom-right corner (Display has a close button in its title bar instead). The window chrome is in [`boxes.css`](boxes.css); the colours are tokens in [`styles.css`](styles.css) (`--face`, `--title`, the bevel shades and so on), swapped per colour by the switcher.

Where they sit by default:

- **Mailing list:** centred under the window in the photo, sized as a golden rectangle from the window's width, as before.
- **Comments:** on screens at least 1100px wide and 640px tall, it floats over the photo on the white wall to the right of the window (clear of the window, inside 16px gutters, at most 460 x 680px). On narrower or shorter screens it sits in the page under the photo, full width less 16px gutters (at most 640px wide). The comments scroll inside it, newest at the bottom next to the form.
- **Display:** closed until its paint roller button opens it (see [Font and colour switcher](#font-and-colour-switcher)). Fixed to the screen, so it stays at hand as the page scrolls. It opens bottom-left, over its button (360px wide); in the top-left corner on short screens narrower than about 1070px, where the card comes down to the bottom; on phones as a compact window along the bottom (slimmer title bar, 28px rows) that clears the card even on a 320 x 568 screen, or along the top on the very shortest phones. Once moved, it opens where it was left.

[`boxes.js`](boxes.js) makes all three movable:

- Drag a box by its title bar, and resize the card and the comments box with the grip (Display has no grip: its rows have one size). It works with a mouse, a finger or a pen; on a phone, touching anywhere else still scrolls the page.
- From the keyboard, Tab to a title bar: the arrow keys move the box and Shift+arrow keys resize it (Display just moves). On the grip the arrow keys resize it. Escape during a drag puts the box back.
- A box can't be made smaller than its content needs (whatever font is picked), and it always stays within the width of the screen with its title bar reachable, also after the window is resized or the phone is turned. Display always stays wholly on screen.
- The box last used comes to the front, Display included (it comes to the front when it opens).
- Each visitor's layout is kept in their browser's `localStorage` under `studio414.layout` (positions and sizes, and the stacking order): page pixels for the card and the comments box, which scroll with the page, and screen pixels for Display, which doesn't. A box that hasn't been moved keeps following the default layout. Stored positions are fitted to smaller screens when they're applied, and come back as they were on a larger one.
- Once something has been moved (Display included), a **Layout: Reset** row appears in the Display window; it puts all three back where they started.

## Comments setup

The comment section has no login: each visitor types a name with their first comment, and their browser remembers it. Comments are stored in [Supabase](https://supabase.com) (the free plan is plenty). Until it is connected, the section runs in a demo mode that keeps comments only in your own browser, and says so on the page.

1. Create a free Supabase project at <https://supabase.com/dashboard>.
2. In the project, open **SQL Editor**, paste in the contents of [`supabase/setup.sql`](supabase/setup.sql) and click **Run**. It creates the `comments` table and the Row Level Security rules (anyone may read comments and add new ones; nobody may edit or delete them through the site). It is safe to run again.
3. Copy the **Project URL** and the **publishable** key (`sb_publishable_…`; the legacy **anon** key, a long `eyJ…` string, works too). Both are under the **Connect** button at the top of the project dashboard, and the keys are also in **Project Settings → API Keys** (older dashboards: **Project Settings → API**).
4. Paste them into [`comments-config.js`](comments-config.js):

   ```js
   window.COMMENTS_CONFIG = {
     supabaseUrl: "https://your-project-ref.supabase.co",
     supabaseAnonKey: "your-anon-or-publishable-key"
   };
   ```

   The anon / publishable key is meant to be public; Row Level Security limits what it can do. Never use the `service_role` / secret key here.
5. Commit and push.

### Moderation

There is no login, so anyone who has the page's URL can post a comment under any name. To remove a comment, delete its row in the Supabase dashboard: **Table Editor → comments**, select the row, **Delete**.

Free Supabase projects are paused after a week or so without activity; if comments stop loading, restore the project from the dashboard.

## Workshop sign-ups

The site can take paid sign-ups for the **Paint a piece** workshop on Saturday 7 November 2026: 10 places at **$59.99 CAD** each (Canadian dollars), paid by card through [Stripe Checkout](https://stripe.com/payments/checkout). The backend lives in the same Supabase project as the comments:

- [`supabase/workshop.sql`](supabase/workshop.sql): the `workshop_signups` table and two database functions. Emails are private: Row Level Security is on with no policies, so the site's public key can't read or change anything in it.
- [`supabase/functions/workshop-checkout`](supabase/functions/workshop-checkout/index.ts): tells the page how many places are left, and starts a Stripe checkout for an email address.
- [`supabase/functions/stripe-webhook`](supabase/functions/stripe-webhook/index.ts): Stripe calls it when someone has paid or a checkout ran out of time.
- [`supabase/config.toml`](supabase/config.toml): turns off Supabase's JWT check for both functions (the site's publishable key isn't a JWT, and Stripe can't send one; the webhook checks Stripe's signature instead).

How a sign-up goes: the visitor enters their email, `workshop-checkout` holds a place for them for 31 minutes (Stripe's 30-minute minimum for a checkout, plus a minute's margin) and sends them to Stripe's payment page. When they pay, the webhook marks their sign-up **paid**; if they give up, Stripe expires the checkout and the place is free again. A place held by someone who is paying right now counts as taken, so the last place can't be sold twice. The workshop's name, date, number of places, price and currency are constants at the top of [`workshop-checkout/index.ts`](supabase/functions/workshop-checkout/index.ts).

### Setting it up

Do this with Stripe's **test mode** first (no real money moves), then repeat the Stripe parts with live keys (see [Going live](#going-live)). Never put a Stripe secret key in the site's files or commit it: it only goes into Supabase's secrets.

1. **Database.** In the Supabase dashboard open **SQL Editor**, paste in the contents of [`supabase/workshop.sql`](supabase/workshop.sql) and click **Run**. It is safe to run again. (The Security Advisor may note that `workshop_signups` has RLS enabled but no policies; that is on purpose.)
2. **Supabase CLI.** The easiest way on any computer with Node.js is `npx`: `npx supabase --version` downloads and runs it (on Windows you can also install it with [Scoop](https://supabase.com/docs/guides/local-development/cli/getting-started)). The commands below are written as `supabase …`; with npx, type `npx supabase …`. Run them from this folder.
3. **Log in and link the project:**

   ```sh
   supabase login
   supabase link --project-ref cgbqzdhjhquprjgtcmwh
   ```

   If `link` asks for the database password, you can leave it blank.
4. **Stripe key and site address.** In the [Stripe Dashboard](https://dashboard.stripe.com), switch to test mode (or a sandbox) and copy the **Secret key** (`sk_test_…`) from **Developers → API keys**. `SITE_URL` is the address of the page visitors come back to after paying, without a trailing slash: the live site's address, or `http://localhost:8000` while trying it locally.

   ```sh
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... SITE_URL=https://your-site-address
   ```

5. **Deploy both functions.** `--no-verify-jwt` turns off the JWT check (as `config.toml` does too); it is needed for both.

   ```sh
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   Check it by opening <https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout> in a browser: it should show `{"capacity":10,"taken":0,"remaining":10}`.
6. **Stripe webhook.** In the Stripe Dashboard (still in test mode) open **Developers → Webhooks** (in newer dashboards **Workbench → Webhooks**) and add an endpoint (a "destination" for events from your account) with:
   - Endpoint URL: `https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.expired`

   Then copy the endpoint's **Signing secret** (`whsec_…`).
7. **Webhook secret.** Save it and redeploy the webhook:

   ```sh
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

### Testing

1. Sign up through the form with your own email. (Before the form is on the page, you can start a checkout from your browser's developer console on any page: `fetch("https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "you@example.com" }) }).then((r) => r.json()).then(console.log)`, then open the `url` it prints.)
2. On Stripe's page pay with the test card **4242 4242 4242 4242**, any future expiry date, any CVC and any postcode. (4000 0000 0000 0002 tries a declined card.)
3. You should land back on `SITE_URL/?workshop=success`, and within a few seconds the sign-up's row in **Table Editor → workshop_signups** should say `paid`.

If it stays `pending`, look at the webhook's deliveries in Stripe (**Webhooks →** your endpoint) and at the functions' logs in Supabase (**Edge Functions →** the function **→ Logs**). A wrong `STRIPE_WEBHOOK_SECRET` shows up as "Invalid signature" (HTTP 400) there.

### Going live

1. In **Table Editor → workshop_signups**, delete the rows from your tests: paid test sign-ups would otherwise count as taken places.
2. Switch the Stripe Dashboard to live mode and copy the live **Secret key** (`sk_live_…`). Live mode has its own webhooks, so add the same endpoint and events again there and copy its new **Signing secret**.
3. Set the live values (and the live site's address, if `SITE_URL` was localhost) and redeploy both functions:

   ```sh
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=https://your-site-address
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

### Seeing who signed up

In the Supabase dashboard open **Table Editor → workshop_signups** and add a filter **status** equals **paid**: those are the confirmed places, with each person's `email` and when they paid (`paid_at`). `pending` rows are people in the middle of paying (or who left without finishing, until Stripe expires the checkout), and `expired` rows are checkouts that were never paid; neither has paid. Each payment is also in the Stripe Dashboard under **Payments**, with the email address.

Or in the **SQL Editor**:

```sql
select email, paid_at
from public.workshop_signups
where workshop = 'paint-a-piece-2026-11-07' and status = 'paid'
order by paid_at;
```

If someone cancels, refund them in Stripe (**Payments →** the payment **→ Refund**), then set their row's `status` to `expired` in the Table Editor to free the place.

### The API (for the sign-up form)

Both calls go to `https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout`, need no key, and answer JSON from any origin.

- `GET` → `200 {"capacity": 10, "taken": 3, "remaining": 7}`. `taken` counts paid sign-ups and checkouts in progress; `remaining` is never below 0.
- `POST` with the body `{"email": "someone@example.com"}` (and `Content-Type: application/json`):
  - `200 {"url": "https://checkout.stripe.com/…"}`: send the visitor to `url`. Afterwards Stripe brings them back to `/?workshop=success`, or to `/?workshop=cancelled` if they went back.
  - `400 {"error": "invalid_email"}`
  - `409 {"error": "already_signed_up"}`: this email has already paid.
  - `409 {"error": "full"}`
  - `500 {"error": "server_error"}`: details are in the function's logs.

Emails are trimmed and lower-cased. If the same email starts a new checkout while an earlier one is still open, the earlier one is closed, so one person doesn't hold two places. The form should disable its button while a request is on its way, so a double click doesn't start two checkouts.

## Font and colour switcher

A small window titled **Display** lets visitors try 10 display fonts and 10 colours independently, so friends can browse combinations and say which they like in a comment ("colour 1 and font 6"). Option 0 of each is the default design (Terminal Grotesque, the Classic grey and navy), so nothing changes for anyone who never touches it; font 1 is EB Garamond, the original face. The window follows the selected colour like the others, and its title bar the selected font; its rows stay in EB Garamond so the controls keep their shape while you browse. See [The boxes](#the-boxes) for where it sits and how it moves.

- **Opening and closing:** Display starts closed. A small button in the bottom-left corner of the screen, a pixel-art paint roller in the 90s style (its roller painted in the current colour), opens it, and stays pressed in while it is open; pressing it again closes it. So do the "×" in Display's title bar and Escape anywhere inside it. Opening moves the keyboard focus to Display's title bar, and closing puts it back on the button. The browser remembers whether it was left open (`localStorage`, `studio414.display`), so a first visit always starts with it closed. The button sits above the windows while Display is closed; Display opens over it.

- **Font** changes the display typography: the big 414, the title bars, the card label, the sign-up button, the field labels, the Post comment button, comment author names and the "Commenting as" line. The fields and the comment text stay in EB Garamond.
- **Colour** is a 90s window scheme for the three windows: the title bar, a tinted face with its own bevel shades, and the ink for author names and links. The title-bar colour is also the page background and the big 414. Text stays black on the face, the fields stay white, and every colour keeps text at 4.5:1 contrast or more and the bevel edges at 3:1 or more.
- A combination can be shared as a link: `?font=6&color=1` (numbers 0 to 10; anything else counts as 0). The link wins over the browser's saved choice, which is kept in `localStorage` under `studio414.style.font` and `studio414.style.color`.

It lives in [`switcher.js`](switcher.js), [`switcher.css`](switcher.css) (the colours and the window), [`fonts.css`](fonts.css) (the fonts) and [`fonts/`](fonts). To remove it, delete those, their `<link>` / `<script>` tags and the small inline script at the top of `index.html`'s `<head>`; the tokens it sets in `styles.css` (`--display-*`, `--big-*`, `--face`, `--title` and the rest) fall back to the default colours, with EB Garamond as the display face. (Without the window there is no Reset button for the layout; visitors can still clear it with their browser's site data.)

## Fonts

The 10 display fonts are from [Velvetyne](https://velvetyne.fr), a French libre type foundry. All are published under the [SIL Open Font License 1.1](https://openfontlicense.org): free to use, embed and redistribute, but not to sell on their own. Each folder in [`fonts/`](fonts) holds the one weight used here, as downloaded from the font's Velvetyne page, with its licence file.

| # | Font | Designers | Weight used |
|---|------|-----------|-------------|
| 0 | [Terminal Grotesque](https://velvetyne.fr/fonts/terminal-grotesque/) (default) | Raphaël Bastide, Jérémy Landes | Regular |
| 1 | EB Garamond (original) | Georg Duffner, Octavio Pardo (via Google Fonts) | Medium; ExtraBold for the 414 |
| 2 | [Basteleur](https://velvetyne.fr/fonts/basteleur/) | Keussel | Moonlight |
| 3 | [Lineal](https://velvetyne.fr/fonts/lineal/) | Frank Adebiaye, Anton Moglia, Ariel Martín Pérez | Medium |
| 4 | [Le Murmure](https://velvetyne.fr/fonts/le-murmure/) | Jérémy Landes | Regular |
| 5 | [Sligoil](https://velvetyne.fr/fonts/sligoil/) | Ariel Martín Pérez, Đông Trúc Nguyễn | Micro Medium |
| 6 | [Ouroboros](https://velvetyne.fr/fonts/ouroboros/) | Ariel Martín Pérez, H·Alix Sanyas | Regular |
| 7 | [Façade](https://velvetyne.fr/fonts/facade/) | Éléonore Fines | Ouest |
| 8 | [Karrik](https://velvetyne.fr/fonts/karrik/) | Jean-Baptiste Morizot, Lucas Le Bihan | Regular |
| 9 | [Trickster](https://velvetyne.fr/fonts/trickster/) | Jean-Baptiste Morizot | Regular |
| 10 | [Compagnon](https://velvetyne.fr/fonts/compagnon/) | Juliette Duhé, Léa Pradine, Valentin Papon, Chloé Lozano, Sébastien Riollier | Medium |

## Colours

Each colour is a window scheme for the three windows, and the colour of the page. All of them keep black text and frames (`#000000`), white fields, a dark red for errors (`#9c0000`) and black focus rings; the bevel highlight and light shades are tints of the face, and the shadow is the lightest shade of the face with 3:1 contrast against it.

The title-bar colour is also the page background (`--page-bg` in `styles.css`): the page, the bands above and below the photo and the fades into them, and the big 414. The title text colour is also the text on the page, such as the credit line at the foot (`--page-text`, 4.8:1 or more in its softened form), and the edge round the 414. Each window stands out from the page by its face or, on the light colours, by its black frame (4.3:1 or more either way).

| # | Colour | Title bar and page | Title text, page text and 414 edge | Face | Bevel shadow | Names and links |
|---|--------|--------------------|------------------------------------|------|--------------|-----------------|
| 0 | Classic (default) | `#0a246a` | `#ffffff` | `#d4d0c8` | `#77746e` | `#0a246a` |
| 1 | Vermilion | `#b5301a` | `#ffffff` | `#ecd3c8` | `#a06e63` | `#a0260f` |
| 2 | Saffron | `#f5b83d` | `#000000` | `#efe1c0` | `#937e53` | `#7a4f00` |
| 3 | Chartreuse | `#cdea3c` | `#000000` | `#e2e8c4` | `#7f8757` | `#4d5c00` |
| 4 | Malachite | `#35c27a` | `#000000` | `#cfe6d6` | `#608872` | `#0b6338` |
| 5 | Verdigris | `#0f5e52` | `#ffffff` | `#cde3de` | `#64857f` | `#0f5e52` |
| 6 | Cerulean | `#4db5f2` | `#000000` | `#d1e3f0` | `#668398` | `#0b5485` |
| 7 | Klein Blue | `#1a33d1` | `#ffffff` | `#d5d9ef` | `#7278a9` | `#1a33d1` |
| 8 | Wisteria | `#b59dff` | `#000000` | `#e0d9f3` | `#8276ab` | `#5130b8` |
| 9 | Fuchsia | `#9c1f86` | `#ffffff` | `#ecd4e6` | `#9b6e92` | `#9c1f86` |
| 10 | Flamingo | `#ff88b1` | `#000000` | `#f3d8e1` | `#a47084` | `#a3134f` |
