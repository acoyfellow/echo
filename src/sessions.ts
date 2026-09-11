import { mintSessionCapabilities, type CapabilityGrant } from "./auth";
import { readBoundedBody } from "./body";
import type { Env } from "./types";

function validBrowserOrigin(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const loopback = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.origin === value && (url.protocol === "https:" || loopback);
  } catch {
    return false;
  }
}

function validRequesterOrigin(value: string | null): value is string {
  if (validBrowserOrigin(value)) return true;
  return typeof value === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(value);
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

export function handleSessionPreflight(request: Request): Response {
  const origin = request.headers.get("origin");
  if (!validRequesterOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  const text = await readBoundedBody(request, 4096);
  if (text === null) return Response.json({ error: "request_too_large" }, { status: 413 });
  let body: { origin?: string; appId?: string; capabilities?: unknown; mode?: string };
  try { body = JSON.parse(text) as { origin?: string; appId?: string; capabilities?: unknown; mode?: string }; }
  catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  if (!body.origin) return Response.json({ error: "origin_required" }, { status: 400 });
  const appId = body.appId ?? "legacy-webmcp";
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(appId)) return Response.json({ error: "app_id_invalid" }, { status: 400 });
  const requestOrigin = request.headers.get("origin");
  const codemode = body.mode === "codemode";
  if (codemode) {
    if (!requestOrigin?.match(/^chrome-extension:\/\/[a-p]{32}$/)) return Response.json({ error: "extension_origin_required" }, { status: 403 });
  } else if (!validBrowserOrigin(requestOrigin) || requestOrigin !== body.origin) {
    return Response.json({ error: "request_origin_mismatch" }, { status: 403 });
  }
  if (!Array.isArray(body.capabilities) || body.capabilities.length === 0 || body.capabilities.length > 100) {
    return Response.json({ error: "capabilities_invalid" }, { status: 400 });
  }
  const grants: CapabilityGrant[] = [];
  for (const value of body.capabilities) {
    if (!value || typeof value !== "object") return Response.json({ error: "capabilities_invalid" }, { status: 400 });
    const candidate = value as { name?: unknown; effect?: unknown };
    if (typeof candidate.name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(candidate.name) || (candidate.effect !== "read" && candidate.effect !== "mutation")) {
      return Response.json({ error: "capabilities_invalid" }, { status: 400 });
    }
    if (grants.some((grant) => grant.name === candidate.name)) return Response.json({ error: "capability_duplicate" }, { status: 400 });
    grants.push({ name: candidate.name, effect: candidate.effect });
  }
  if (codemode && (appId !== "echo-codemode" || grants.length !== 1 || grants[0]?.name !== "page.evaluate" || grants[0].effect !== "mutation")) {
    return Response.json({ error: "codemode_grant_invalid" }, { status: 400 });
  }
  let parsed: URL;
  try { parsed = new URL(body.origin); }
  catch { return Response.json({ error: "bad_origin" }, { status: 400 }); }
  const loopback = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.origin !== body.origin || (parsed.protocol !== "https:" && !loopback)) return Response.json({ error: "secure_origin_required" }, { status: 400 });
  const lifetimeHours = Math.max(1 / 60, Math.min(Number(env.ECHO_MAX_SESSION_HOURS || "1"), 1));
  const minted = await mintSessionCapabilities(env.ECHO_SIGNING_SECRET, parsed.origin, lifetimeHours, appId, grants);
  return Response.json({ ...minted, origin: parsed.origin, lifetimeHours }, { headers: corsHeaders(requestOrigin) });
}
