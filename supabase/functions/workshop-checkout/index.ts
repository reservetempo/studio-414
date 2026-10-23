/*
  Workshop sign-ups for Studio 414: the workshops, spots left, and paying through
  Stripe Checkout.

    GET  /functions/v1/workshop-checkout
         200 { "workshops": [
               { "id": "paint-a-piece", "name": "Paint a piece", "date": "2026-11-07",
                 "startTime": "13:00", "endTime": "15:30",
                 "description": "Paint a piece of bisque pottery ...",
                 "price": 5999, "currency": "cad",
                 "capacity": 10, "taken": 3, "remaining": 7 },
               ...
             ] }

         The workshops in the public.workshops table (supabase/workshops.sql; the
         owners edit it on admin.html) that aren't hidden and are still upcoming,
         soonest first (an empty list when there are none). "date" is the workshop's
         day (YYYY-MM-DD, studio time); it stays listed until that day has ended in
         STUDIO_TIME_ZONE. "startTime" and "endTime" are "HH:MM" (24-hour clock,
         studio time) or null when not set; "description" is text or null. "price"
         is per spot, in cents.

    POST /functions/v1/workshop-checkout
         body { "workshop": "paint-a-piece", "email": "someone@example.com",
                "name": "Sam Lee", "quantity": 2, "friendName": "Alex Kim" }

           workshop    an id from the GET list
           email       up to 254 characters; stored trimmed and lower-cased
           name        required; up to 100 characters (runs of spaces become one)
           quantity    a whole number (a JSON number) of spots, 1 to "remaining"
           friendName  optional, up to 100 characters; leave it out, or send null or
                       "", when there's no friend

         200 { "url": "https://checkout.stripe.com/..." }   send the visitor there;
                                                           Stripe charges price × quantity
         400 { "error": "unknown_workshop" }      missing, not a workshop, or hidden
         409 { "error": "workshop_past" }         its day has ended
         400 { "error": "invalid_email" }
         400 { "error": "invalid_name" }          missing, blank, not text or too long
         400 { "error": "invalid_friend_name" }   not text, or too long
         400 { "error": "invalid_quantity" }      not a whole number from 1 to "capacity"
         409 { "error": "already_signed_up" }     this email has already paid for this workshop
         409 { "error": "full" }                  no spots left
         409 { "error": "not_enough_spots", "remaining": 2 }   fewer spots left than asked for
         405 { "error": "method_not_allowed" }    not GET, POST or OPTIONS
         500 { "error": "server_error" }          details go to the function's logs

         Checks run in the order listed; the first that fails is the answer. After
         paying, Stripe sends the visitor to SITE_URL/?workshop=success; leaving the
         checkout sends them to SITE_URL/?workshop=cancelled.

  "taken" counts spots, not orders: those of paid sign-ups plus those of checkouts
  still in progress (their spots are held until the Stripe session expires), so the
  last spots can't be sold twice. The stripe-webhook function marks sign-ups paid or
  expired when Stripe reports back.

  One order per email per workshop: a new checkout closes the same email's unfinished
  one for that workshop, and once an email has paid for a workshop it gets
  already_signed_up there (it can still book the other workshops).

  Runs with JWT verification off (see supabase/config.toml): the site calls it with
  its publishable key, which is not a JWT. It reads the workshops table and reads and
  writes the sign-ups table with the service role key, which never leaves the server.

  Environment: STRIPE_SECRET_KEY and SITE_URL (set with `supabase secrets set`), plus
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.
*/
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

/* ---------- The workshops ---------- */

// The workshops live in the public.workshops table (supabase/workshops.sql), which
// the owners edit on admin.html. Past ones drop off on their own; hidden ones are
// left out of GET and refused by POST.
type Workshop = {
  id: string; // stored with each sign-up; spots are counted by it
  name: string;
  date: string; // YYYY-MM-DD, the day of the workshop in STUDIO_TIME_ZONE
  startTime: string | null; // "HH:MM", 24-hour clock, studio time
  endTime: string | null;
  description: string | null;
  capacity: number; // spots
  priceCents: number; // per spot (Stripe amounts are in cents)
};

const WORKSHOP_COLUMNS = "id, name, date, start_time, end_time, description, capacity, price_cents, hidden";

const CURRENCY = "cad"; // Canadian dollars

// The studio's time zone: a workshop's day ends at midnight here.
const STUDIO_TIME_ZONE = "America/Toronto";

// How long spots are held while someone is in Stripe Checkout. Stripe's minimum
// session length is 30 minutes from when the session is created; the extra minute
// keeps network delay and clock drift from tripping that limit.
const CHECKOUT_SECONDS = 30 * 60 + 60;

const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;

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

/** Today's date in the studio's time zone, as YYYY-MM-DD. */
function studioToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "13:00:00" (a Postgres time) -> "13:00"; null stays null. */
function timeOfDay(value: unknown, row: unknown): string | null {
  if (value === null || value === undefined) return null;
  const match = typeof value === "string" ? /^(\d{2}):(\d{2})/.exec(value) : null;
  if (!match) throw new Error(`Unexpected workshop row ${JSON.stringify(row)}`);
  return `${match[1]}:${match[2]}`;
}

/** A row of public.workshops as a Workshop (checked, in case the table changes shape). */
function toWorkshop(row: Record<string, unknown>): Workshop {
  const { id, name, date, description, capacity, price_cents: priceCents } = row;
  if (
    typeof id !== "string" || typeof name !== "string" ||
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    (description !== null && typeof description !== "string") ||
    typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 ||
    typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < 1
  ) {
    throw new Error(`Unexpected workshop row ${JSON.stringify(row)}`);
  }
  return {
    id,
    name,
    date,
    startTime: timeOfDay(row.start_time, row),
    endTime: timeOfDay(row.end_time, row),
    description: description || null,
    capacity,
    priceCents,
  };
}

/** Workshops that aren't hidden and whose day hasn't ended yet in studio time, soonest first. */
async function upcomingWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select(WORKSHOP_COLUMNS)
    .eq("hidden", false)
    .gte("date", studioToday())
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (error) throw new Error(`Reading workshops failed: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toWorkshop);
}

/** The workshop with this id, or null when there's none or it is hidden. */
async function findWorkshop(id: unknown): Promise<Workshop | null> {
  if (typeof id !== "string" || !id || id.length > 64) return null;
  const { data, error } = await supabase
    .from("workshops")
    .select(WORKSHOP_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Reading workshop ${id} failed: ${error.message}`);
  const row = data as unknown as Record<string, unknown> | null;
  if (!row || row.hidden !== false) return null;
  return toWorkshop(row);
}

/** "2026-11-07" -> "7 November 2026" */
function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** Trimmed, with runs of whitespace made one space; null if empty, too long or odd. */
function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > NAME_MAX || /\p{Cc}/u.test(name)) return null;
  return name;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function siteUrl(): string {
  const url = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new Error("SITE_URL is not set (e.g. https://example.com)");
  return url;
}

/** Spots taken in each of these workshops (0 when nothing is taken). */
async function countTaken(ids: string[]): Promise<Map<string, number>> {
  const taken = new Map<string, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return taken;

  const { data, error } = await supabase.rpc("workshop_taken", { p_workshops: ids });
  if (error) throw new Error(`workshop_taken failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error(`workshop_taken returned ${JSON.stringify(data)}`);

  for (const row of data as { workshop?: unknown; taken?: unknown }[]) {
    const count = Number(row.taken);
    if (typeof row.workshop !== "string" || !Number.isFinite(count)) {
      throw new Error(`workshop_taken returned ${JSON.stringify(data)}`);
    }
    taken.set(row.workshop, count);
  }
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
 * visitor can't pay for it any more and its spots are released.
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
 * Before reserving spots in a workshop:
 * - this email's own checkouts for it still in progress (say they went back and tried
 *   again) are closed, so one person doesn't hold several orders, and if one of them
 *   was paid in the meantime the visitor is told they're already signed up;
 * - checkouts whose hold has run out but that were never marked paid or expired
 *   (the webhook missed them or hasn't arrived yet) are checked with Stripe, so a
 *   payment the webhook hasn't recorded still counts.
 */
async function settlePending(workshopId: string, email: string): Promise<void> {
  const { data, error } = await supabase
    .from("workshop_signups")
    .select("id, email, stripe_session_id, expires_at")
    .eq("workshop", workshopId)
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
  const workshops = await upcomingWorkshops();
  const taken = await countTaken(workshops.map((w) => w.id));
  return json(200, {
    workshops: workshops.map((w) => {
      const spotsTaken = taken.get(w.id) ?? 0;
      return {
        id: w.id,
        name: w.name,
        date: w.date,
        startTime: w.startTime,
        endTime: w.endTime,
        description: w.description,
        price: w.priceCents,
        currency: CURRENCY,
        capacity: w.capacity,
        taken: spotsTaken,
        remaining: Math.max(0, w.capacity - spotsTaken),
      };
    }),
  });
}

async function handlePost(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Not JSON: treated as an empty body below.
  }
  const input: Record<string, unknown> =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  const workshop = await findWorkshop(input.workshop);
  if (!workshop) return json(400, { error: "unknown_workshop" });
  if (workshop.date < studioToday()) return json(409, { error: "workshop_past" });

  const email = normalizeEmail(input.email);
  if (!email) return json(400, { error: "invalid_email" });

  const name = normalizeName(input.name);
  if (!name) return json(400, { error: "invalid_name" });

  const hasFriend = !isBlank(input.friendName);
  const friendName = hasFriend ? normalizeName(input.friendName) : null;
  if (hasFriend && !friendName) return json(400, { error: "invalid_friend_name" });

  const quantity = input.quantity;
  if (
    typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 ||
    quantity > workshop.capacity
  ) {
    return json(400, { error: "invalid_quantity" });
  }

  const success = `${siteUrl()}/?workshop=success`;
  const cancel = `${siteUrl()}/?workshop=cancelled`;

  await settlePending(workshop.id, email);

  // Hold the spots. The row's expires_at matches the Stripe session's, so they are
  // held for exactly as long as the visitor can pay.
  const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SECONDS;
  const { data: reservation, error: reserveError } = await supabase.rpc("workshop_reserve", {
    p_workshop: workshop.id,
    p_email: email,
    p_name: name,
    p_friend_name: friendName,
    p_quantity: quantity,
    p_capacity: workshop.capacity,
    p_expires_at: new Date(expiresAt * 1000).toISOString(),
  });
  if (reserveError) throw new Error(`workshop_reserve failed: ${reserveError.message}`);

  const result = (reservation ?? {}) as { result?: string; id?: string; remaining?: number };
  if (result.result === "already_signed_up") return json(409, { error: "already_signed_up" });
  if (result.result === "full") return json(409, { error: "full" });
  if (result.result === "not_enough_spots" && Number.isInteger(result.remaining)) {
    return json(409, { error: "not_enough_spots", remaining: result.remaining });
  }
  if (result.result !== "reserved" || !result.id) {
    throw new Error(`workshop_reserve returned ${JSON.stringify(reservation)}`);
  }
  const signupId = result.id;

  const release = async () => {
    const { error } = await supabase.from("workshop_signups").delete().eq("id", signupId);
    if (error) console.error(`Could not release reservation ${signupId}:`, error.message);
  };

  const productName = `${workshop.name} workshop: ${dateLabel(workshop.date)}`;
  const metadata = {
    workshop: workshop.id,
    workshop_date: workshop.date,
    quantity: String(quantity),
    signup_id: signupId,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        // Cards only (Apple Pay and Google Pay included): bank debits settle days
        // later, long after the spots' hold has run out.
        payment_method_types: ["card"],
        line_items: [
          {
            quantity,
            price_data: {
              currency: CURRENCY,
              unit_amount: workshop.priceCents,
              product_data: { name: productName },
            },
          },
        ],
        customer_email: email,
        client_reference_id: signupId,
        expires_at: expiresAt,
        success_url: success,
        cancel_url: cancel,
        metadata,
        payment_intent_data: {
          description: `${productName} (${quantity === 1 ? "1 spot" : `${quantity} spots`})`,
          metadata,
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
