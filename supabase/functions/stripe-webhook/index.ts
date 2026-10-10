/*
  Stripe webhook for Studio 414 workshop sign-ups.

  Stripe calls this when a Checkout session made by workshop-checkout finishes:
    checkout.session.completed (and paid)  ->  the sign-up becomes "paid"
    checkout.session.expired               ->  a pending sign-up becomes "expired",
                                               which frees its spots

  A sign-up is one order, however many spots it has, and has one Checkout session,
  so the workshop and the number of spots don't matter here.

  Every request's signature is checked against STRIPE_WEBHOOK_SECRET (the endpoint's
  "Signing secret", whsec_...); anything that fails gets a 400. Sign-ups are found by
  their Stripe session id; sessions that aren't workshop sign-ups are acknowledged
  and ignored. A database error answers 500, so Stripe tries again later.

  Runs with JWT verification off (see supabase/config.toml): Stripe can't send a
  Supabase JWT, so the signature is what keeps strangers out.

  Environment: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (set with
  `supabase secrets set`), plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which
  Supabase provides.
*/
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Deno has no Node crypto for HMAC, so signatures are checked with Web Crypto.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

let stripeClient: Stripe | null = null;

function stripe(): Stripe {
  if (!stripeClient) {
    const key = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeClient = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  }
  return stripeClient;
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Updates the sign-up for this session. Returns how many rows changed (0 or 1). */
async function updateSignup(
  sessionId: string,
  values: Record<string, unknown>,
  onlyIfStatus: string[],
): Promise<number> {
  const { data, error } = await supabase
    .from("workshop_signups")
    .update(values)
    .eq("stripe_session_id", sessionId)
    .in("status", onlyIfStatus)
    .select("id");
  if (error) throw new Error(`Updating sign-up for ${sessionId} failed: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return text(405, "Method not allowed");

  const secret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) {
    // 500, not 400: Stripe keeps retrying for a few days, so nothing is lost while
    // the secret is being set.
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return text(500, "Webhook secret not configured");
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return text(400, "Missing Stripe-Signature header");

  // The signature covers the exact bytes Stripe sent, so read the raw body.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    console.warn("Rejected webhook with a bad signature:", error instanceof Error ? error.message : error);
    return text(400, "Invalid signature");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        // Also from "expired": Stripe's word that it was paid is final.
        const changed = await updateSignup(
          session.id,
          { status: "paid", paid_at: new Date().toISOString() },
          ["pending", "expired"],
        );
        console.log(
          changed
            ? `Sign-up paid: ${session.id}`
            : `No unpaid sign-up for ${session.id} (already recorded, or not a workshop checkout)`,
        );
      } else {
        console.log(`Checkout ${session.id} completed with payment_status ${session.payment_status}; left as is`);
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const changed = await updateSignup(session.id, { status: "expired" }, ["pending"]);
      console.log(
        changed
          ? `Sign-up expired: ${session.id}`
          : `No pending sign-up for ${session.id} (already settled, or not a workshop checkout)`,
      );
    } else {
      console.log(`Ignored event ${event.type}`);
    }
  } catch (error) {
    console.error(`Handling ${event.type} (${event.id}) failed:`, error);
    return text(500, "Could not record the event");
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
