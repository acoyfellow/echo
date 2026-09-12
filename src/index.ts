import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { attachSvelteRoutes, svelteRenderer } from "svelte-hono";
import { verifyCapability } from "./auth";
import { bundles } from "../generated/bundles.generated";
import { handleMcp } from "./mcp";
import { handleSessionCreate, handleSessionPreflight } from "./sessions";
import { renderFavicon, renderOg, renderRobots, renderSitemap } from "./site";
import type { Env } from "./types";
import ArcadeApp from "../examples/ArcadeApp.svelte";
import { examples as catalogExamples } from "../examples/catalog";
import Notes from "../examples/notes/App.svelte";
import Todo from "../examples/todo/App.svelte";
import Examples from "./ui/Examples.svelte";
import Home from "./ui/Home.svelte";
import OwnerCut from "./ui/OwnerCut.svelte";

export { EchoAgent } from "./agent";

const app = new Hono<{ Bindings: Env }>({ strict: false });
attachSvelteRoutes(app as unknown as Hono, { bundles });

const head = (path: string) => `<link rel="stylesheet" href="/site.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:url" content="https://echo.coey.dev${path}"><meta name="twitter:card" content="summary_large_image">`;

app.get("/", svelteRenderer(Home, { hydrateAs: "home", title: "Echo — wire an agent into your web app", head: head("/"), props: {} }));
app.get("/examples", svelteRenderer(Examples, { hydrateAs: "examples", title: "Echo examples — little apps for agents", head: head("/examples/"), props: {} }));
app.get("/spike/owner-cut", svelteRenderer(OwnerCut, { hydrateAs: "ownerCut", title: "Echo owner cut — alternate homepage", head: head("/spike/owner-cut/"), props: {} }));
app.get("/examples/todo", svelteRenderer(Todo, { hydrateAs: "todo", title: "Tiny Todo — Echo example", head: head("/examples/todo/"), props: {} }));
app.get("/examples/notes", svelteRenderer(Notes, { hydrateAs: "notes", title: "Live Notes — Echo example", head: head("/examples/notes/"), props: {} }));
for (const example of catalogExamples.slice(2)) {
  app.get(`/examples/${example.slug}`, svelteRenderer(ArcadeApp, { hydrateAs: "arcade", title: `${example.name} — Echo example`, head: head(`/examples/${example.slug}/`), props: { slug: example.slug } }));
}
app.get("/demo", svelteRenderer(Notes, { hydrateAs: "notes", title: "Live Notes — Echo example", head: head("/demo/"), props: {} }));

app.get("/health", (context) => {
  const env = context.env;
  const ready = typeof env.ECHO_SIGNING_SECRET === "string" && env.ECHO_SIGNING_SECRET.length >= 32 && !env.ECHO_SIGNING_SECRET.includes("generate-with");
  return context.json({ ok: ready, version: "0.0.1", mode: env.ECHO_HOSTED_INSTANCE === "dev" ? "dev" : "prod", commit: env.ECHO_COMMIT_SHA ?? "local" }, ready ? 200 : 503);
});

app.options("/sessions", (context) => handleSessionPreflight(context.req.raw));
app.post("/sessions", (context) => {
  const ready = typeof context.env.ECHO_SIGNING_SECRET === "string" && context.env.ECHO_SIGNING_SECRET.length >= 32 && !context.env.ECHO_SIGNING_SECRET.includes("generate-with");
  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);
  return handleSessionCreate(context.req.raw, context.env);
});
app.all("/mcp", (context) => {
  const ready = typeof context.env.ECHO_SIGNING_SECRET === "string" && context.env.ECHO_SIGNING_SECRET.length >= 32 && !context.env.ECHO_SIGNING_SECRET.includes("generate-with");
  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);
  return handleMcp(context.req.raw, context.env);
});
app.all("/agents/*", async (context) => {
  const env = context.env;
  const ready = typeof env.ECHO_SIGNING_SECRET === "string" && env.ECHO_SIGNING_SECRET.length >= 32 && !env.ECHO_SIGNING_SECRET.includes("generate-with");
  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);
  const url = new URL(context.req.url);
  const token = url.searchParams.get("token");
  const verified = token ? await verifyCapability(env.ECHO_SIGNING_SECRET, token, "page") : null;
  if (!verified) return context.text("invalid_session", 401);
  if (url.pathname !== `/agents/echo-agent/${verified.id}`) return context.text("session_id_mismatch", 401);
  const claimedOrigin = url.searchParams.get("origin");
  if (claimedOrigin && claimedOrigin !== verified.origin) return context.text("origin_mismatch", 401);
  url.searchParams.set("origin", verified.origin);
  url.searchParams.set("appId", verified.appId);
  url.searchParams.set("grants", JSON.stringify(verified.grants));
  url.searchParams.set("expiresAt", String(verified.expiresAt));
  const response = await routeAgentRequest(new Request(url.toString(), context.req.raw), env);
  return response ?? context.text("agent_route_failed", 404);
});

app.get("/favicon.svg", () => renderFavicon());
app.get("/favicon.ico", () => renderFavicon());
app.get("/og.svg", () => renderOg());
app.get("/robots.txt", () => renderRobots());
app.get("/sitemap.xml", () => renderSitemap());
app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

export default app;
