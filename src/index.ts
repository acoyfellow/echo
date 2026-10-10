import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { attachSvelteRoutes, svelteRenderer } from "svelte-hono";
import { verifyCapability } from "./auth";
import { bundles } from "../generated/bundles.generated";
import { handleMcp } from "./mcp";
import { handleSessionCreate, handleSessionPreflight } from "./sessions";
import { renderRobots, renderSitemap, SITE_URL } from "./site";
import type { Env } from "./types";
import ArcadeApp from "../examples/ArcadeApp.svelte";
import { examples as catalogExamples } from "../examples/catalog";
import Notes from "../examples/notes/App.svelte";
import Todo from "../examples/todo/App.svelte";
import Examples from "./ui/Examples.svelte";
import Home from "./ui/Home.svelte";

export { EchoAgent } from "./agent";

export { CapabilityBridge } from "./codemode";

const app = new Hono<{ Bindings: Env }>({ strict: false });

const svelteRoutes = new Hono({ strict: false });

attachSvelteRoutes(svelteRoutes, { bundles });

app.route("/", svelteRoutes);

function signingReady(bindings: Env): boolean {
  const secret = bindings.ECHO_SIGNING_SECRET ?? "";

  return secret.length >= 32 && !secret.includes("generate-with");
}

const head = (path: string) =>
  [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,400;0,500;0,700;1,400&display=swap">`,
    `<link rel="stylesheet" href="/site.css">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon.ico" sizes="48x48">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    `<meta name="theme-color" content="#f4f1ea">`,
    `<link rel="canonical" href="${SITE_URL}${path}">`,
    `<meta property="og:url" content="${SITE_URL}${path}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Echo">`,
    `<meta property="og:image" content="${SITE_URL}/og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Echo: let an agent use your web app. Diagram of app, session, sandbox, and agent.">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${SITE_URL}/og.png">`,
  ].join("");

app.get(
  "/",
  svelteRenderer(Home, {
    hydrateAs: "home",
    title: "Echo — let an agent use your web app",
    head: head("/"),
    props: {},
  }),
);

app.get(
  "/examples",
  svelteRenderer(Examples, {
    hydrateAs: "examples",
    title: "Echo examples — little apps for agents",
    head: head("/examples/"),
    props: {},
  }),
);

app.get(
  "/examples/todo",
  svelteRenderer(Todo, {
    hydrateAs: "todo",
    title: "Tiny Todo — Echo example",
    head: head("/examples/todo/"),
    props: {},
  }),
);

app.get(
  "/examples/notes",
  svelteRenderer(Notes, {
    hydrateAs: "notes",
    title: "Live Notes — Echo example",
    head: head("/examples/notes/"),
    props: {},
  }),
);

for (const example of catalogExamples.slice(2)) {
  app.get(
    `/examples/${example.slug}`,
    svelteRenderer(ArcadeApp, {
      hydrateAs: "arcade",
      title: `${example.name} — Echo example`,
      head: head(`/examples/${example.slug}/`),
      props: { slug: example.slug },
    }),
  );
}

app.get(
  "/demo",
  svelteRenderer(Notes, {
    hydrateAs: "notes",
    title: "Live Notes — Echo example",
    head: head("/demo/"),
    props: {},
  }),
);

app.get("/health", (context) => {
  const env = context.env;

  const ready = signingReady(env);

  return context.json(
    {
      ok: ready,
      version: "0.0.1",
      mode: env.ECHO_HOSTED_INSTANCE === "dev" ? "dev" : "prod",
      commit: env.ECHO_COMMIT_SHA ?? "local",
    },
    ready ? 200 : 503,
  );
});

app.options("/sessions", (context) => handleSessionPreflight(context.req.raw));

app.post("/sessions", (context) => {
  const ready = signingReady(context.env);

  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);

  return handleSessionCreate(context.req.raw, context.env);
});

app.all("/mcp", (context) => {
  const ready = signingReady(context.env);

  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);

  return handleMcp(context.req.raw, context.env);
});

app.all("/agents/*", async (context) => {
  const env = context.env;

  const ready = signingReady(env);

  if (!ready) return context.json({ error: "signing_secret_unavailable" }, 503);
  const url = new URL(context.req.url);
  const token = url.searchParams.get("token");
  const verified = token ? await verifyCapability(env.ECHO_SIGNING_SECRET, token, "page") : null;

  if (!verified) return context.text("invalid_session", 401);

  if (url.pathname !== `/agents/echo-agent/${verified.id}`)
    return context.text("session_id_mismatch", 401);
  const claimedOrigin = url.searchParams.get("origin");

  if (claimedOrigin && claimedOrigin !== verified.origin)
    return context.text("origin_mismatch", 401);
  url.searchParams.set("origin", verified.origin);
  url.searchParams.set("appId", verified.appId);
  url.searchParams.set("grants", JSON.stringify(verified.grants));
  url.searchParams.set("expiresAt", String(verified.expiresAt));
  const response = await routeAgentRequest(new Request(url.toString(), context.req.raw), env);

  return response ?? context.text("agent_route_failed", 404);
});

app.get("/robots.txt", () => renderRobots());

app.get("/sitemap.xml", () => renderSitemap());

app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

export default app;
