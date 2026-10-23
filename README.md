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

The owners' page is at `/admin.html` (for example `https://your-site-address/admin.html`). Nothing on the site links to it, and search engines are asked not to list it. Owners sign in with their Google account; anyone else who signs in is told their account isn't an owner account. The Wallpaper and Workshops sections are still to come.

1. In the [Google Cloud console](https://console.cloud.google.com/), pick or create a project. Set up the OAuth consent screen (**Google Auth Platform**, or **APIs & Services → OAuth consent screen**): app name "Studio 414", audience **External**, and your email as the contact. Then publish the app (**Audience → Publish app**), or add each owner's Google email there as a test user.
2. Create the OAuth client (**Clients**, or **APIs & Services → Credentials → Create credentials → OAuth client ID**): type **Web application**, with this under **Authorised redirect URIs**:

   ```
   https://cgbqzdhjhquprjgtcmwh.supabase.co/auth/v1/callback
   ```

   Copy the client ID and client secret.
3. In the Supabase dashboard, **Authentication → Sign In / Providers → Google**: turn it on, paste in the client ID and client secret, and save. The secret only goes here, never into the site's files.
4. **Authentication → URL Configuration**: under **Redirect URLs**, add the live page's address (`https://your-site-address/admin.html`) and `http://localhost:8000/admin.html`.
5. **SQL Editor**: paste in [`supabase/owners.sql`](supabase/owners.sql) and click **Run**.
6. Still in the SQL Editor, add each owner's Google email, in lower case, one line per owner:

   ```sql
   insert into public.site_owners (email) values ('owner@gmail.com');
   ```

7. Test: open `/admin.html` and click **Sign in with Google**. If you land on another page afterwards, the address isn't in the Redirect URLs from step 4 exactly as it appears in the browser.

Leave **Authentication → Sign In / Providers → Email → Confirm email** on (it is by default): owners are recognised by email, so nobody should be able to sign in with an address whose inbox they don't have.

## Set up the wallpaper upload

Owners will upload a new wallpaper photo for the site from the owner page and mark where the mailing-list card sits on it (that part of the page is still to come). The photo goes to Cloudinary; the site reads which photo to show from Supabase ([`supabase/wallpaper.sql`](supabase/wallpaper.sql) describes the setting). Set up the owner page first.

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

Owners will pick one theme and one colour for both the public site and the owner page, on the owner page (that part of the page is still to come). Both pages read it from Supabase in [`look.js`](look.js); [`supabase/look.sql`](supabase/look.sql) describes the setting, and [`themes/README.md`](themes/README.md) how a theme is written. Until a look is saved, the site stays Aqua in Classic. Set up the wallpaper upload first.

1. **SQL Editor**: paste in [`supabase/look.sql`](supabase/look.sql) and click **Run** (after `wallpaper.sql`, which makes the settings table).

To try a look without saving it, add `?theme=<id>&color=<n>` to either page's address, for example `index.html?theme=nes&color=6`.

## Still to do

- The "Join the mailing list" form isn't connected to any service yet: it only shows a thank-you message.
- Past workshops drop off on their own, but after 5 December there's nothing left to book. Add the next workshops (see "Set up workshop sign-ups"), or take the workshop button down: removing the `workshop.js` script tag from `index.html` is enough, as the button stays hidden without it.
