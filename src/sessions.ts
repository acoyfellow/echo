import { mintSessionCapabilities } from "./auth";
import { readBoundedBody } from "./body";
import { codemodeExtensionOrigin } from "./codemode";
import type { Env } from "./types";

const codemodeGrant = [{ name: "page.evaluate", effect: "mutation" as const }];

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": codemodeExtensionOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

export function handleSessionPreflight(request: Request): Response {
  if (request.headers.get("origin") !== codemodeExtensionOrigin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("origin") !== codemodeExtensionOrigin) return Response.json({ error: "extension_origin_required" }, { status: 403 });
  const text = await readBoundedBody(request, 4096);
  if (text === null) return Response.json({ error: "request_too_large" }, { status: 413 });
  let body: { origin?: string; appId?: string; capabilities?: unknown; mode?: string };
  try { body = JSON.parse(text) as { origin?: string; appId?: string; capabilities?: unknown; mode?: string }; }
  catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  if (body.mode !== "codemode" || body.appId !== "echo-codemode") return Response.json({ error: "codemode_required" }, { status: 400 });
  if (JSON.stringify(body.capabilities) !== JSON.stringify(codemodeGrant)) return Response.json({ error: "codemode_grant_invalid" }, { status: 400 });
  let page: URL;
  try { page = new URL(body.origin ?? ""); }
  catch { return Response.json({ error: "bad_origin" }, { status: 400 }); }
  const loopback = page.protocol === "http:" && (page.hostname === "localhost" || page.hostname === "127.0.0.1");
  if (page.origin !== body.origin || (page.protocol !== "https:" && !loopback)) return Response.json({ error: "secure_origin_required" }, { status: 400 });
  const lifetimeHours = Math.max(1 / 60, Math.min(Number(env.ECHO_MAX_SESSION_HOURS || "1"), 1));
  const minted = await mintSessionCapabilities(env.ECHO_SIGNING_SECRET, page.origin, lifetimeHours, "echo-codemode", codemodeGrant);
  return Response.json({ ...minted, origin: page.origin, lifetimeHours }, { headers: corsHeaders() });
}
