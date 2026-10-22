# Studio 414

A one-page site for the Studio 414 studio space, in plain HTML, CSS and JavaScript, with comments (already connected to Supabase) and paid workshop sign-ups through Supabase and Stripe.

## Set up workshop sign-ups

Two workshops, each with 10 spots at $59.99 CAD a spot:

- "Paint a piece" (`paint-a-piece`), Saturday 7 November 2026
- "Hand building" (`hand-building`), Saturday 5 December 2026

A visitor signs up with their name and email, books 1 spot or more (up to the spots left), and can give a friend's name. Each email gets one order per workshop. A workshop drops off the list once its day is over in Toronto time (change `STUDIO_TIME_ZONE` in the function if the studio is in another time zone).

The workshops, their dates, spots and prices are set in the `WORKSHOPS` list at the top of [`supabase/functions/workshop-checkout/index.ts`](supabase/functions/workshop-checkout/index.ts); `workshop.js` keeps a matching list of ids, names and dates, so change both, then deploy `workshop-checkout` again (step 4). Give a new workshop a new id, even when it repeats an old one: spots are counted by id.

The code is written but not deployed. Do everything in Stripe **test mode** first. Stripe secret keys only go into Supabase secrets, never into the site's files.

1. In the Supabase dashboard, open **SQL Editor**, paste in [`supabase/workshop.sql`](supabase/workshop.sql) and click **Run**.
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

   Afterwards <https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout> should show both workshops, like this but on one line (`price` is in cents):

   ```json
   {"workshops":[
     {"id":"paint-a-piece","name":"Paint a piece","date":"2026-11-07","price":5999,"currency":"cad","capacity":10,"taken":0,"remaining":10},
     {"id":"hand-building","name":"Hand building","date":"2026-12-05","price":5999,"currency":"cad","capacity":10,"taken":0,"remaining":10}
   ]}
   ```

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

## Still to do

- The "Join the mailing list" form isn't connected to any service yet: it only shows a thank-you message.
- Past workshops drop off on their own, but after 5 December there's nothing left to book. Add the next workshops (see above), or take the workshop button down: removing the `workshop.js` script tag from `index.html` is enough, as the button stays hidden without it.
