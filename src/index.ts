/**
 * echo — the worker entry.
 *
 *   POST /sessions      mint a signed session id  (extension calls this)
 *   POST /mcp?id=<>     MCP JSON-RPC              (agents call this)
 *   GET  /agents/...    Agent SDK WebSocket route (extension upgrades here)
 *   GET  /health        version + mode
 */

import { routeAgentRequest } from "agents";
import { mintSessionId, verifySessionId } from "./auth";
import { handleMcp } from "./mcp";
import { renderLanding, renderDemo, renderFavicon, renderOg, renderRobots, renderSitemap } from "./site";
import type { Env } from "./types";

export { EchoAgent } from "./agent";
export { EchoPlan } from "./plan";
export { TabBinding } from "./tab-binding";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, authorization",
  "access-control-expose-headers": "mcp-session-id",
  "access-control-max-age": "86400",
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return withCors(Response.json({
        ok: true,
        version: "0.0.1",
        mode: env.ECHO_HOSTED_INSTANCE === "dev" ? "dev" : "prod",
      }));
    }

    if (url.pathname === "/sessions" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { origin?: string };
      if (!body.origin) return withCors(Response.json({ error: "origin_required" }, { status: 400 }));
      let parsed: URL;
      try { parsed = new URL(body.origin); }
      catch { return withCors(Response.json({ error: "bad_origin" }, { status: 400 })); }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return withCors(Response.json({ error: "bad_protocol" }, { status: 400 }));
      }
      if (parsed.pathname !== "/" && parsed.pathname !== "") {
        return withCors(Response.json({ error: "origin_must_be_bare" }, { status: 400 }));
      }
      const lifetimeHours = Number(env.ECHO_MAX_SESSION_HOURS || "8");
      const { id, signed } = await mintSessionId(env.ECHO_SIGNING_SECRET, parsed.origin, lifetimeHours);
      return withCors(Response.json({ id, signed, origin: parsed.origin, lifetimeHours }));
    }

    if (url.pathname === "/mcp") {
      return withCors(await handleMcp(req, env));
    }

    // Agent SDK websocket routing. Path: /agents/echo-agent/<sessionId>
    // (camelCase class name kebab-cased by the SDK).
    if (url.pathname.startsWith("/agents/")) {
      const token = url.searchParams.get("token");
      const verified = token ? await verifySessionId(env.ECHO_SIGNING_SECRET, token) : null;
      if (!verified) return new Response("invalid_session", { status: 401 });

      // Path must be /agents/echo-agent/<verified.id>
      const expected = `/agents/echo-agent/${verified.id}`;
      if (url.pathname !== expected) return new Response("session_id_mismatch", { status: 401 });

      // The session id is signed with the origin it was minted for. If the
      // caller supplied an ?origin= that disagrees with the signed origin,
      // reject — a valid token must not be re-pointed at a different origin.
      const claimedOrigin = url.searchParams.get("origin");
      if (claimedOrigin && claimedOrigin !== verified.origin) {
        return new Response("origin_mismatch", { status: 401 });
      }
      // Force the canonical (signed) origin downstream so the DO pins the
      // origin the token was actually minted for, not a client-supplied one.
      url.searchParams.set("origin", verified.origin);
      const canonicalReq = new Request(url.toString(), req);

      const resp = await routeAgentRequest(canonicalReq, env);
      if (resp) return resp;
      return new Response("agent_route_failed", { status: 404 });
    }

    // Public site.
    if (url.pathname === "/") return renderLanding();
    if (url.pathname === "/demo") return renderDemo();
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") return renderFavicon();
    if (url.pathname === "/og.svg") return renderOg();
    if (url.pathname === "/robots.txt") return renderRobots();
    if (url.pathname === "/sitemap.xml") return renderSitemap();

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
