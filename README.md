# Studio 414

A one-page site for the Studio 414 studio space, in plain HTML, CSS and JavaScript, with comments (already connected to Supabase) and paid workshop sign-ups through Supabase and Stripe.

## Set up workshop sign-ups

The owners add and edit workshops (name, date, times, description, spots, price, and whether it's hidden) on the owner page, `/admin.html`. They are stored in the `workshops` table ([`supabase/workshops.sql`](supabase/workshops.sql) describes it). Until the owner page's Workshops section is ready, edit them in **Table Editor → workshops**. It starts with two workshops, each with 10 spots at $59.99 CAD a spot: "Paint a piece" (`paint-a-piece`) on 7 November 2026 and "Hand building" (`hand-building`) on 5 December 2026.

A visitor signs up with their name and email, books 1 spot or more (up to the spots left), and can give a friend's name. Each email gets one order per workshop. A workshop drops off the list once its day is over in Toronto time (change `STUDIO_TIME_ZONE` in [`workshop-checkout`](supabase/functions/workshop-checkout/index.ts) if the studio is in another time zone). A workshop with paid sign-ups can't be deleted (hide it instead), and its spots can't go below those already taken.

The code is written but not deployed. Do everything in Stripe **test mode** first. Stripe secret keys only go into Supabase secrets, never into the site's files.

1. In the Supabase dashboard, open **SQL Editor**. Paste in each of these and click **Run**, in this order: [`supabase/owners.sql`](supabase/owners.sql) (if it hasn't been run yet; see "Set up the owner page"), [`supabase/workshop.sql`](supabase/workshop.sql), then [`supabase/workshops.sql`](supabase/workshops.sql). If you ever run `workshop.sql` again, run `workshops.sql` again after it.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (or type `npx supabase` wherever it says `supabase`), then from this folder run the lines below. If `link` asks for the database password, leave it blank.

   ```sh
   supabase login
   supabase link --project-ref cgbqzdhjhquprjgtcmwh
   ```

3. Set the Stripe test secret key (Stripe Dashboard → **Developers → API keys**, `sk_test_…`) and the site's real public address:

   ```sh
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... SITE_URL=https://your-site-address
   ```

4. Deploy both functions:

   ```sh
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   Afterwards <https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout> should show the upcoming workshops that aren't hidden, like this but on one line (`price` is in cents; times and descriptions are `null` until the owners fill them in):

   ```json
   {"workshops":[
     {"id":"paint-a-piece","name":"Paint a piece","date":"2026-11-07","startTime":null,"endTime":null,"description":null,"price":5999,"currency":"cad","capacity":10,"taken":0,"remaining":10},
     {"id":"hand-building","name":"Hand building","date":"2026-12-05","startTime":null,"endTime":null,"description":null,"price":5999,"currency":"cad","capacity":10,"taken":0,"remaining":10}
   ]}
   ```

   If an older `workshop-checkout` (one with the workshops written into it) was deployed earlier, deploy it again so it reads the `workshops` table.

5. In Stripe (still test mode), **Developers → Webhooks** (or **Workbench → Webhooks**), add an endpoint `https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/stripe-webhook` for the events `checkout.session.completed` and `checkout.session.expired`. Copy its signing secret (`whsec_…`), then:

   ```sh
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

6. Test: on the site, sign up for one workshop with your name and own email, book 2 spots and pay with card `4242 4242 4242 4242` (any future expiry date, any CVC). Stripe should charge $119.98, and you should come back to the site with a thank-you. Your row in **Table Editor → workshop_signups** should say `paid` with `quantity` 2, and the address from step 4 should show `"taken":2` for that workshop.
7. Go live:
   - In **Table Editor → workshop_signups**, delete your test rows (they count as taken spots).
   - In Stripe's live mode, copy the live secret key (`sk_live_…`), add the same webhook endpoint and events again (live mode has its own webhooks) and copy its new signing secret. Then:

   ```sh
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

**Who signed up:** Supabase **Table Editor → workshop_signups**, filtered to `status` = `paid` and the workshop's id in `workshop`. Each row is one order: `name`, `email`, `quantity` (spots paid for) and `friend_name` (if they gave one).

## Set up the owner page

The owners' page is at `/admin.html` (for example `https://your-site-address/admin.html`). Nothing on the site links to it, and search engines are asked not to list it. Owners sign in with an email and password. An owner is someone with a user in Supabase **Authentication** whose email is also in the `site_owners` list; you add both by hand, and nobody can sign themselves up. Anyone who signs in but isn't in `site_owners` is told their account isn't an owner account.

1. In the Supabase dashboard, **Authentication → Sign In / Providers**: make sure **Email** is turned on (it is by default), and turn **off** **Allow new users to sign up**, then save. Owners are only ever added by hand (step 3).
2. **SQL Editor**: paste in [`supabase/owners.sql`](supabase/owners.sql) and click **Run** (if it hasn't been run yet).
3. For each owner:
   1. **Authentication → Users → Add user → Create new user**: their email and a password, with **Auto Confirm User** ticked. Give them the password yourself.
   2. In the **SQL Editor**, add the same email, in lower case:

      ```sql
      insert into public.site_owners (email) values ('owner@example.com');
      ```

4. Test: open `/admin.html` and sign in with an owner's email and password. The owner page should open. An account that isn't in `site_owners` sees "isn't an owner account" instead.

To change an owner's password, open **Authentication → Users** and use that user's menu (there's no "Forgot password?" on the page). To remove an owner, delete their email from `site_owners` (see [`supabase/owners.sql`](supabase/owners.sql)) and their user in **Authentication → Users**.

## Set up the wallpaper upload

Owners upload a new wallpaper photo for the site from the Wallpaper section of the owner page and mark where the mailing-list card sits on it. The photo goes to Cloudinary; the site reads which photo to show from Supabase ([`supabase/wallpaper.sql`](supabase/wallpaper.sql) describes the setting). Set up the owner page first.

1. Create a free account at [Cloudinary](https://cloudinary.com/).
2. In the Cloudinary Console, copy the **cloud name** (on the dashboard), then the **API key** and **API secret** (**Settings → API Keys**).
3. From this folder (with the Supabase CLI from "Set up workshop sign-ups", step 2), save all three as Supabase secrets. The API secret only ever goes here, never into the site's files.

   ```sh
   supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
   ```

4. **SQL Editor**: paste in [`supabase/wallpaper.sql`](supabase/wallpaper.sql) and click **Run** (after `owners.sql`).
5. Deploy the function that signs the uploads (it checks the owner's sign-in itself):

   ```sh
   supabase functions deploy cloudinary-sign --no-verify-jwt
   ```

   Afterwards, `curl -X POST https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/cloudinary-sign` should answer `{"error":"not_signed_in",...}`.

## Set up the site look

Owners pick one theme and one colour for both the public site and the owner page, in the Look section of the owner page. Both pages read it from Supabase in [`look.js`](look.js); [`supabase/look.sql`](supabase/look.sql) describes the setting, and [`themes/README.md`](themes/README.md) how a theme is written. Until a look is saved, the site stays Aqua in Classic. Set up the wallpaper upload first.

1. **SQL Editor**: paste in [`supabase/look.sql`](supabase/look.sql) and click **Run** (after `wallpaper.sql`, which makes the settings table).

To try a look without saving it, add `?theme=<id>&color=<n>` to either page's address, for example `index.html?theme=nes&color=6`.

Visitors can change the page for themselves, on their own screen only, in Display, a plain panel at the very end of the public site, under the comments ([`switcher.js`](switcher.js)). **Colour** starts on "Site colour", which follows the owners' look; any other colour of the 21 stays with that visitor (kept in their browser) until they pick "Site colour" again or press the Styles **Reset**. **414 font** picks one of twenty faces for the big 414 and "Opening soon!" only; all other text keeps the theme's font. The owner page always shows the owners' colour, and `?color=` in the address wins over a visitor's own colour. If they have dragged or resized the mailing-list card or the big 414, a Layout **Reset** puts them back.

## Set up the site layout

Owners arrange the public site for every visitor: how big the photo is, and where the mailing-list card and the big 414 start. The public site reads that arrangement from Supabase in [`layout.js`](layout.js), which also describes the value; [`supabase/layout.sql`](supabase/layout.sql) describes the setting. Until a layout is saved, the site keeps the layout its CSS gives it. Set up the wallpaper upload first.

1. **SQL Editor**: paste in [`supabase/layout.sql`](supabase/layout.sql) and click **Run** (after `wallpaper.sql`, which makes the settings table).

## Still to do

- The "Join the mailing list" form isn't connected to any service yet: it only shows a thank-you message.
- Past workshops drop off on their own, but after 5 December there's nothing left to book. Add the next workshops (see "Set up workshop sign-ups"), or take the workshop button down: removing the `workshop.js` script tag from `index.html` is enough, as the button stays hidden without it.
