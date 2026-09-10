import { routeAgentRequest } from "agents";
import { verifyCapability } from "./auth";
import { handleMcp } from "./mcp";
import { renderFavicon, renderLanding, renderOg, renderRobots, renderSitemap } from "./site";
import { handleSessionCreate, handleSessionPreflight } from "./sessions";
import type { Env } from "./types";

export { EchoAgent } from "./agent";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const signingReady = typeof env.ECHO_SIGNING_SECRET === "string" && env.ECHO_SIGNING_SECRET.length >= 32 && !env.ECHO_SIGNING_SECRET.includes("generate-with");
    if (url.pathname === "/health") {
      return Response.json({ ok: signingReady, version: "0.0.1", mode: env.ECHO_HOSTED_INSTANCE === "dev" ? "dev" : "prod" }, { status: signingReady ? 200 : 503 });
    }
    if (!signingReady && (url.pathname === "/sessions" || url.pathname === "/mcp" || url.pathname.startsWith("/agents/"))) {
      return Response.json({ error: "signing_secret_unavailable" }, { status: 503 });
    }
    if (url.pathname === "/sessions" && request.method === "OPTIONS") return handleSessionPreflight(request);
    if (url.pathname === "/sessions" && request.method === "POST") return handleSessionCreate(request, env);
    if (url.pathname === "/mcp") return handleMcp(request, env);
    if (url.pathname.startsWith("/agents/")) {
      const token = url.searchParams.get("token");
      const verified = token ? await verifyCapability(env.ECHO_SIGNING_SECRET, token, "page") : null;
      if (!verified) return new Response("invalid_session", { status: 401 });
      if (url.pathname !== `/agents/echo-agent/${verified.id}`) return new Response("session_id_mismatch", { status: 401 });
      const claimedOrigin = url.searchParams.get("origin");
      if (claimedOrigin && claimedOrigin !== verified.origin) return new Response("origin_mismatch", { status: 401 });
      url.searchParams.set("origin", verified.origin);
      url.searchParams.set("appId", verified.appId);
      url.searchParams.set("grants", JSON.stringify(verified.grants));
      url.searchParams.set("expiresAt", String(verified.expiresAt));
      const response = await routeAgentRequest(new Request(url.toString(), request), env);
      return response ?? new Response("agent_route_failed", { status: 404 });
    }
    if (url.pathname === "/") return renderLanding();
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") return renderFavicon();
    if (url.pathname === "/og.svg") return renderOg();
    if (url.pathname === "/robots.txt") return renderRobots();
    if (url.pathname === "/sitemap.xml") return renderSitemap();
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
