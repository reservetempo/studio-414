# Studio 414

A one-page site for the Studio 414 studio space, in plain HTML, CSS and JavaScript, with comments (already connected to Supabase) and paid workshop sign-ups through Supabase and Stripe.

## Set up workshop sign-ups

"Paint a piece", 7 November 2026: 10 spots at $59.99 CAD. The code is written but not deployed. Do everything in Stripe **test mode** first. Stripe secret keys only go into Supabase secrets, never into the site's files.

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

4. Deploy both functions. Afterwards <https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/workshop-checkout> should show `{"capacity":10,"taken":0,"remaining":10}`.

   ```sh
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

5. In Stripe (still test mode), **Developers → Webhooks** (or **Workbench → Webhooks**), add an endpoint `https://cgbqzdhjhquprjgtcmwh.supabase.co/functions/v1/stripe-webhook` for the events `checkout.session.completed` and `checkout.session.expired`. Copy its signing secret (`whsec_…`), then:

   ```sh
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

6. Test: sign up on the site with your own email and pay with card `4242 4242 4242 4242` (any future expiry date, any CVC). You should come back to the site with a thank-you, and your row in **Table Editor → workshop_signups** should say `paid`.
7. Go live:
   - In **Table Editor → workshop_signups**, delete your test rows (they count as taken spots).
   - In Stripe's live mode, copy the live secret key (`sk_live_…`), add the same webhook endpoint and events again (live mode has its own webhooks) and copy its new signing secret. Then:

   ```sh
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy workshop-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

**Who signed up:** Supabase **Table Editor → workshop_signups**, filtered to `status` = `paid`.

## Still to do

- The "Join the mailing list" form isn't connected to any service yet: it only shows a thank-you message.
- Sign-ups don't close on their own. Take the workshop button down after 7 November: removing the `workshop.js` script tag from `index.html` is enough, as the button stays hidden without it.
