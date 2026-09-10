import { mintSessionCapabilities, type CapabilityGrant } from "./auth";
import { readBoundedBody } from "./body";
import type { Env } from "./types";

function originsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const a = new URL(left);
    const b = new URL(right);
    const aLoopback = a.hostname === "localhost" || a.hostname === "127.0.0.1";
    const bLoopback = b.hostname === "localhost" || b.hostname === "127.0.0.1";
    return aLoopback && bLoopback && a.protocol === b.protocol && a.port === b.port;
  } catch {
    return false;
  }
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  const text = await readBoundedBody(request, 4096);
  if (text === null) return Response.json({ error: "request_too_large" }, { status: 413 });
  let body: { origin?: string; appId?: string; capabilities?: unknown };
  try { body = JSON.parse(text) as { origin?: string; appId?: string; capabilities?: unknown }; }
  catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  if (!body.origin) return Response.json({ error: "origin_required" }, { status: 400 });
  const appId = body.appId ?? "legacy-webmcp";
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(appId)) return Response.json({ error: "app_id_invalid" }, { status: 400 });
  const requestOrigin = request.headers.get("origin");
  const sameOriginFetch = originsMatch(new URL(request.url).origin, body.origin);
  const explicitOriginMatches = requestOrigin === "null" && isLoopbackOrigin(body.origin)
    ? sameOriginFetch
    : Boolean(requestOrigin && originsMatch(requestOrigin, body.origin));
  if (requestOrigin ? !explicitOriginMatches : !sameOriginFetch) return Response.json({ error: "request_origin_mismatch" }, { status: 403 });
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
  let parsed: URL;
  try { parsed = new URL(body.origin); }
  catch { return Response.json({ error: "bad_origin" }, { status: 400 }); }
  const loopback = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.origin !== body.origin || (parsed.protocol !== "https:" && !loopback)) return Response.json({ error: "secure_origin_required" }, { status: 400 });
  const lifetimeHours = Math.max(1 / 60, Math.min(Number(env.ECHO_MAX_SESSION_HOURS || "1"), 1));
  const minted = await mintSessionCapabilities(env.ECHO_SIGNING_SECRET, parsed.origin, lifetimeHours, appId, grants);
  return Response.json({ ...minted, origin: parsed.origin, lifetimeHours });
}
