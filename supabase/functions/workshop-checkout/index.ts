/*
  Workshop sign-ups for Studio 414: spots left, and paying through Stripe Checkout.

    GET  /functions/v1/workshop-checkout
         200 { "capacity": 10, "taken": 3, "remaining": 7 }

    POST /functions/v1/workshop-checkout   body { "email": "someone@example.com" }
         200 { "url": "https://checkout.stripe.com/..." }   send the visitor there
         400 { "error": "invalid_email" }
         409 { "error": "already_signed_up" }   this email has already paid
         409 { "error": "full" }
         500 { "error": "server_error" }        details go to the function's logs

  "taken" counts paid sign-ups plus checkouts still in progress (their spot is held
  until the Stripe session expires), so the last spot can't be sold twice. The
  stripe-webhook function marks sign-ups paid or expired when Stripe reports back.

  Runs with JWT verification off (see supabase/config.toml): the site calls it with
  its publishable key, which is not a JWT. It reads and writes the sign-ups table
  with the service role key, which never leaves the server.

  Environment: STRIPE_SECRET_KEY and SITE_URL (set with `supabase secrets set`), plus
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.
*/
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

/* ---------- The workshop ---------- */

const WORKSHOP_SLUG = "paint-a-piece-2026-11-07";
const WORKSHOP_TITLE = "Paint a piece";
const WORKSHOP_DATE = "2026-11-07";
const WORKSHOP_DATE_LABEL = "7 November 2026";
const CAPACITY = 10;
const PRICE_CENTS = 5999; // $59.99 CAD (Stripe amounts are in cents)
const CURRENCY = "cad"; // Canadian dollars

const PRODUCT_NAME = `${WORKSHOP_TITLE} workshop: ${WORKSHOP_DATE_LABEL}`;

// How long a spot is held while someone is in Stripe Checkout. Stripe's minimum
// session length is 30 minutes from when the session is created; the extra minute
// keeps network delay and clock drift from tripping that limit.
const CHECKOUT_SECONDS = 30 * 60 + 60;

const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Clients ---------- */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Made on first use, so the spot count (GET) works even before Stripe is set up.
let stripeClient: Stripe | null = null;

function stripe(): Stripe {
  if (!stripeClient) {
    const key = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeClient = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  }
  return stripeClient;
}

/* ---------- Responses ---------- */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** An expected outcome that ends the request with a given response. */
class Reply extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/* ---------- Helpers ---------- */

type StripeLikeError = { type?: string; code?: string; param?: string; statusCode?: number };

function stripeError(error: unknown): StripeLikeError {
  return error && typeof error === "object" ? (error as StripeLikeError) : {};
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function siteUrl(): string {
  const url = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new Error("SITE_URL is not set (e.g. https://example.com)");
  return url;
}

async function countTaken(): Promise<number> {
  const { data, error } = await supabase.rpc("workshop_taken", { p_workshop: WORKSHOP_SLUG });
  if (error) throw new Error(`workshop_taken failed: ${error.message}`);
  const taken = Number(data);
  if (!Number.isFinite(taken)) throw new Error(`workshop_taken returned ${JSON.stringify(data)}`);
  return taken;
}

/* ---------- Pending checkouts ---------- */

type PendingRow = {
  id: string;
  email: string;
  stripe_session_id: string;
  expires_at: string | null;
};

async function markRow(id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("workshop_signups")
    .update(values)
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(`Updating sign-up ${id} failed: ${error.message}`);
}

/**
 * Brings a pending row in line with its Stripe session: marks it paid or expired
 * when Stripe says so. With close set, an open session is expired first, so the
 * visitor can't pay for it any more and its spot is released.
 */
async function settle(row: PendingRow, close: boolean): Promise<"paid" | "expired" | "open"> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(row.stripe_session_id);
    if (close && session.status === "open") {
      try {
        session = await stripe().checkout.sessions.expire(row.stripe_session_id);
      } catch (error) {
        // It may have been paid a moment ago; look again.
        console.warn(`Could not expire ${row.stripe_session_id}:`, error);
        session = await stripe().checkout.sessions.retrieve(row.stripe_session_id);
      }
    }
  } catch (error) {
    // A session Stripe doesn't know, e.g. one made with test keys before switching
    // to live keys. Nobody can pay for it.
    if (stripeError(error).code === "resource_missing") {
      await markRow(row.id, { status: "expired" });
      return "expired";
    }
    throw error;
  }

  if (session.status === "complete" && session.payment_status === "paid") {
    await markRow(row.id, { status: "paid", paid_at: new Date().toISOString() });
    return "paid";
  }
  if (session.status === "expired") {
    await markRow(row.id, { status: "expired" });
    return "expired";
  }
  return "open";
}

/**
 * Before reserving a spot:
 * - this email's own checkouts still in progress (say they went back and tried again)
 *   are closed, so one person doesn't hold several spots, and if one of them was
 *   paid in the meantime the visitor is told they're already signed up;
 * - checkouts whose hold has run out but that were never marked paid or expired
 *   (the webhook missed them or hasn't arrived yet) are checked with Stripe, so a
 *   payment the webhook hasn't recorded still counts.
 */
async function settlePending(email: string): Promise<void> {
  const { data, error } = await supabase
    .from("workshop_signups")
    .select("id, email, stripe_session_id, expires_at")
    .eq("workshop", WORKSHOP_SLUG)
    .eq("status", "pending")
    .not("stripe_session_id", "is", null);
  if (error) throw new Error(`Listing pending sign-ups failed: ${error.message}`);

  const now = Date.now();
  for (const row of (data ?? []) as unknown as PendingRow[]) {
    const lapsed = !row.expires_at || Date.parse(row.expires_at) <= now;
    if (row.email === email) {
      if ((await settle(row, true)) === "paid") throw new Reply(409, "already_signed_up");
    } else if (lapsed) {
      // Someone else's lapsed hold doesn't count as taken either way, so a failure
      // here shouldn't stop this sign-up.
      await settle(row, false).catch((error) => {
        console.warn(`Could not check lapsed checkout ${row.stripe_session_id}:`, error);
      });
    }
  }
}

/* ---------- Handlers ---------- */

async function handleGet(): Promise<Response> {
  const taken = await countTaken();
  return json(200, {
    capacity: CAPACITY,
    taken,
    remaining: Math.max(0, CAPACITY - taken),
  });
}

async function handlePost(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Not JSON: treated as a missing email below.
  }
  const email = normalizeEmail(
    body && typeof body === "object" ? (body as { email?: unknown }).email : undefined,
  );
  if (!email) return json(400, { error: "invalid_email" });

  const success = `${siteUrl()}/?workshop=success`;
  const cancel = `${siteUrl()}/?workshop=cancelled`;

  await settlePending(email);

  // Hold a spot. The row's expires_at matches the Stripe session's, so the spot is
  // held for exactly as long as the visitor can pay.
  const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SECONDS;
  const { data: reservation, error: reserveError } = await supabase.rpc("workshop_reserve", {
    p_workshop: WORKSHOP_SLUG,
    p_email: email,
    p_capacity: CAPACITY,
    p_expires_at: new Date(expiresAt * 1000).toISOString(),
  });
  if (reserveError) throw new Error(`workshop_reserve failed: ${reserveError.message}`);

  const result = (reservation ?? {}) as { result?: string; id?: string };
  if (result.result === "already_signed_up") return json(409, { error: "already_signed_up" });
  if (result.result === "full") return json(409, { error: "full" });
  if (result.result !== "reserved" || !result.id) {
    throw new Error(`workshop_reserve returned ${JSON.stringify(reservation)}`);
  }
  const signupId = result.id;

  const release = async () => {
    const { error } = await supabase.from("workshop_signups").delete().eq("id", signupId);
    if (error) console.error(`Could not release reservation ${signupId}:`, error.message);
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        // Cards only (Apple Pay and Google Pay included): bank debits settle days
        // later, long after the spot's hold has run out.
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              unit_amount: PRICE_CENTS,
              product_data: { name: PRODUCT_NAME },
            },
          },
        ],
        customer_email: email,
        client_reference_id: signupId,
        expires_at: expiresAt,
        success_url: success,
        cancel_url: cancel,
        metadata: { workshop: WORKSHOP_SLUG, workshop_date: WORKSHOP_DATE, signup_id: signupId },
        payment_intent_data: {
          description: PRODUCT_NAME,
          metadata: { workshop: WORKSHOP_SLUG, signup_id: signupId },
        },
      },
      { idempotencyKey: `workshop-checkout-${signupId}` },
    );
  } catch (error) {
    await release();
    const detail = stripeError(error);
    if (detail.type === "StripeInvalidRequestError" && detail.param === "customer_email") {
      return json(400, { error: "invalid_email" });
    }
    throw error;
  }

  const { error: saveError } = await supabase
    .from("workshop_signups")
    .update({ stripe_session_id: session.id })
    .eq("id", signupId);
  if (saveError || !session.url) {
    // Without its session id the webhook couldn't match the payment, so don't let
    // anyone pay for this session.
    await stripe().checkout.sessions.expire(session.id).catch((error) => {
      console.error(`Could not expire unsaved session ${session.id}:`, error);
    });
    await release();
    throw new Error(
      saveError ? `Saving session ${session.id} failed: ${saveError.message}` : `Session ${session.id} has no url`,
    );
  }

  return json(200, { url: session.url });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    if (req.method === "GET") return await handleGet();
    if (req.method === "POST") return await handlePost(req);
    return json(405, { error: "method_not_allowed" });
  } catch (error) {
    if (error instanceof Reply) return json(error.status, { error: error.code });
    console.error("workshop-checkout failed:", error);
    return json(500, { error: "server_error" });
  }
});
