/**
 * Session-id signing.
 *
 * Carried over from echo-v0 with no behaviour change.
 * Format: `session.<id>.<originB64>.<expSeconds>.<hmac>`
 * HMAC-SHA-256(secret, "session.<id>.<originB64>.<expSeconds>"), base64url.
 *
 * The "session" kind prefix is mixed into the signed head so a future
 * non-session token (installation id, plan id, etc.) cannot be replayed
 * as a session id and vice versa. The kind-confusion bug we caught in
 * v0 stays caught.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const SESSION_KIND = "session";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, msg: string, sig: string): Promise<boolean> {
  const expected = await hmac(secret, msg);
  return timingSafeEqual(expected, sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return atob(padded);
}

export async function mintSessionId(
  secret: string,
  origin: string,
  lifetimeHours: number,
): Promise<{ id: string; signed: string }> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const originB64 = b64url(enc.encode(origin));
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, lifetimeHours * 3600);
  const head = `${SESSION_KIND}.${id}.${originB64}.${exp}`;
  const sig = await hmac(secret, head);
  return { id, signed: `${head}.${sig}` };
}

export async function verifySessionId(
  secret: string,
  signed: string,
): Promise<{ id: string; origin: string; exp: number } | null> {
  const parts = signed.split(".");
  if (parts.length !== 5) return null;
  const [kind, id, originB64, expStr, sig] = parts;
  if (kind !== SESSION_KIND || !id || !originB64 || !expStr || !sig) return null;
  const head = `${kind}.${id}.${originB64}.${expStr}`;
  const ok = await hmacVerify(secret, head, sig);
  if (!ok) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  let origin: string;
  try {
    origin = dec.decode(Uint8Array.from(b64urlDecode(originB64), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  return { id, origin, exp };
}

/**
 * Given a session-pinned origin and a requested path, return an absolute
 * URL if same-origin, else null. Worker-side defense-in-depth on top of
 * the content script's same-origin check.
 */
export function resolvePathAgainstOrigin(pinnedOrigin: string, path: string): URL | null {
  let target: URL;
  try { target = new URL(path, pinnedOrigin); } catch { return null; }
  let pinned: URL;
  try { pinned = new URL(pinnedOrigin); } catch { return null; }
  if (target.origin !== pinned.origin) return null;
  return target;
}
