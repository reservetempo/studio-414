/*
  Signs wallpaper uploads to Cloudinary for the owner page (admin.html). The owner's
  browser uploads the photo straight to Cloudinary; this function only signs the
  upload, so the Cloudinary API secret never leaves Supabase.

    POST /functions/v1/cloudinary-sign
         headers  Authorization: Bearer <the signed-in owner's Supabase access token>
         no body needed (any body is ignored)

         200 { "cloudName": "your-cloud-name", "apiKey": "123456789012345",
               "timestamp": 1792670400, "signature": "<40 hex characters>",
               "folder": "studio-414/wallpaper" }

         Then upload the photo from the browser, within the hour (Cloudinary refuses
         older timestamps):

           POST https://api.cloudinary.com/v1_1/<cloudName>/image/upload
                multipart form fields: file, api_key=<apiKey>, timestamp=<timestamp>,
                                       folder=<folder>, signature=<signature>

         Send exactly those fields. Cloudinary checks the signature against every other
         field sent (all but file, api_key, resource_type and cloud_name), so adding one,
         such as public_id, needs it signed here too. Cloudinary's reply has secure_url,
         width and height for the wallpaper setting (see supabase/wallpaper.sql).

         401 { "error": "not_signed_in", "message": "..." }   no token, or it's invalid
                                                               or expired
         403 { "error": "not_owner", "message": "..." }       signed in, but not an
                                                               owner account
         503 { "error": "cloudinary_not_set_up", "message": "Cloudinary isn't set up yet." }
                                                               a Cloudinary secret is missing
         405 { "error": "method_not_allowed" }                 not POST or OPTIONS
         500 { "error": "server_error" }                       details go to the logs

         "message" is plain text the owner page can show as it is.

  Signing: the parameters to sign (folder and timestamp) sorted by name and joined as
  "folder=...&timestamp=...", followed directly by the API secret, hashed with SHA-1
  and written as lower-case hex.

  Runs with JWT verification off (see supabase/config.toml) and checks the token
  itself: it asks Supabase Auth who the token belongs to, then asks the database
  (is_owner(), see supabase/owners.sql) whether that account is an owner's. That way
  the CORS preflight, which carries no token, still gets through.

  Secrets (supabase secrets set ...): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and
  CLOUDINARY_API_SECRET. Supabase provides SUPABASE_URL and SUPABASE_ANON_KEY.
*/
import { createClient } from "npm:@supabase/supabase-js@2";

// Every wallpaper goes into this Cloudinary folder.
const FOLDER = "studio-414/wallpaper";

/* ---------- Responses ---------- */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  constructor(readonly status: number, readonly code: string, readonly text: string) {
    super(code);
  }
}

/* ---------- Owner check ---------- */

/** The token from "Authorization: Bearer <token>", or null. */
function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((req.headers.get("Authorization") ?? "").trim());
  return match ? match[1] : null;
}

/** Ends the request with 401 or 403 unless the token belongs to an owner. */
async function requireOwner(req: Request): Promise<void> {
  const token = bearerToken(req);
  if (!token) throw new Reply(401, "not_signed_in", "Please sign in again.");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");

  // Acts as the caller: the database sees their token, so is_owner() answers for them.
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Supabase Auth checks the token (signature, expiry, and that the session still exists).
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    const status = (error as { status?: number }).status ?? 0;
    // 4xx: the token is bad. Anything else (Auth down, network) is our problem.
    if (status >= 400 && status < 500) throw new Reply(401, "not_signed_in", "Please sign in again.");
    throw new Error(`Checking the token failed: ${error.message}`);
  }
  if (!data.user) throw new Reply(401, "not_signed_in", "Please sign in again.");

  const { data: isOwner, error: ownerError } = await supabase.rpc("is_owner");
  if (ownerError) throw new Error(`is_owner() failed: ${ownerError.message}`);
  if (isOwner !== true) {
    throw new Reply(403, "not_owner", "This account isn't an owner account.");
  }
}

/* ---------- Signing ---------- */

/** SHA-1 of the text, as lower-case hex. */
async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Cloudinary's signature: params sorted by name, "k=v" joined by "&", then the secret. */
function cloudinarySignature(params: Record<string, string | number>, apiSecret: string): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  return sha1Hex(toSign + apiSecret);
}

async function handlePost(req: Request): Promise<Response> {
  await requireOwner(req);

  const cloudName = (Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "").trim();
  const apiKey = (Deno.env.get("CLOUDINARY_API_KEY") ?? "").trim();
  const apiSecret = (Deno.env.get("CLOUDINARY_API_SECRET") ?? "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    console.error("cloudinary-sign: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET is not set");
    throw new Reply(503, "cloudinary_not_set_up", "Cloudinary isn't set up yet.");
  }

  const timestamp = Math.floor(Date.now() / 1000); // Unix time in seconds
  const signature = await cloudinarySignature({ folder: FOLDER, timestamp }, apiSecret);

  return json(200, { cloudName, apiKey, timestamp, signature, folder: FOLDER });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    if (req.method === "POST") return await handlePost(req);
    return json(405, { error: "method_not_allowed" });
  } catch (error) {
    if (error instanceof Reply) return json(error.status, { error: error.code, message: error.text });
    console.error("cloudinary-sign failed:", error);
    return json(500, { error: "server_error" });
  }
});
