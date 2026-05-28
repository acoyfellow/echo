/**
 * Public docs site, served from the same Worker. One file, no build step.
 *
 * Routes (wired in src/index.ts):
 *   GET /              landing
 *   GET /demo          live demo (mint + run a plan, show step log)
 *   GET /favicon.svg   echo mark
 *   GET /og.svg        OG card (1200x630 SVG)
 *   GET /robots.txt    sitemap pointer
 *   GET /sitemap.xml   crawl map
 *
 * The demo IS dogfooding: it mints a real session against this worker, runs
 * a real plan, polls real status, surfaces real receipts. No fakery.
 *
 * Code snippets are syntax-highlighted at request time by @speed-highlight/core.
 * The library is tiny (~10KB) and runs in any JS env including Cloudflare Workers.
 */

import { highlightText } from "@speed-highlight/core";

// Canonical absolute base URL. Doubles as the JSON-LD @id and OG og:url root.
// Override via env if needed; for now hard-code the personal workers.dev URL.
export const SITE_URL = "https://echo.coey.dev";
export const SITE_NAME = "echo";
export const SITE_TAGLINE = "An agent can drive your logged-in tab without ever holding your password.";
export const SITE_DESC =
  "echo gives an MCP-compatible agent one revocable way to run code in a browser tab you've already signed into. No cookie copying. No API tokens. No headless browser pretending to be you.";
export const GITHUB_URL = "https://github.com/acoyfellow/echo";

// Permalinks to specific lines of the source so trust claims are citeable.
const SRC = (path: string, line: number) => `${GITHUB_URL}/blob/main/${path}#L${line}`;
const CITE = {
  globalOutbound: SRC("src/agent.ts", 171),
  tabIdPin: SRC("extension/background.ts", 150),
  tabCloseRevoke: SRC("extension/background.ts", 161),
  hmacFormat: SRC("src/auth.ts", 5),
  originVerify: SRC("src/auth.ts", 69),
  workerLoader: SRC("src/agent.ts", 161),
  workflow: SRC("src/plan.ts", 1),
  mcpTool: SRC("src/mcp.ts", 1),
  mainWorld: SRC("extension/background.ts", 128),
};

const TS_THEME_CSS = /* css */ `
/* @speed-highlight/core github-dark, scoped to .shj */
.shj { white-space: pre; color: #c9d1d9; background: #0d1117; border-radius: 8px; padding: 18px 20px; margin: 0; overflow-x: auto; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.shj-syn-cmnt { color: #8b949e; font-style: italic; }
.shj-syn-kwd, .shj-syn-err { color: #ff7b72; }
.shj-syn-class { color: #ffa657; }
.shj-syn-type, .shj-syn-oper, .shj-syn-num, .shj-syn-section, .shj-syn-var, .shj-syn-bool { color: #79c0ff; }
.shj-syn-str { color: #a5d6ff; }
.shj-syn-func { color: #d2a8ff; }
.shj-syn-insert { color: #98c379; }
.shj-syn-deleted { color: #ff7b72; }
`;

// Highlight TS source -> inner HTML (no wrapper). We then wrap in <pre class="shj">.
async function ts(src: string): Promise<string> {
  const trimmed = src.replace(/^\n/, "").replace(/\s+$/, "");
  try {
    const inner = await highlightText(trimmed, "ts", false);
    return `<pre class="shj shj-lang-ts">${inner}</pre>`;
  } catch {
    const esc = trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="shj shj-lang-ts">${esc}</pre>`;
  }
}

function shellHead(opts: { title: string; description: string; path: string }): string {
  const url = `${SITE_URL}${opts.path}`;
  const og = `${SITE_URL}/og.svg`;
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESC,
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: og,
        sameAs: [GITHUB_URL, "https://twitter.com/acoyfellow"],
      },
      {
        "@type": "SoftwareSourceCode",
        name: SITE_NAME,
        codeRepository: GITHUB_URL,
        programmingLanguage: "TypeScript",
        license: "https://opensource.org/licenses/MIT",
        runtimePlatform: "Cloudflare Workers",
        description: SITE_DESC,
        applicationCategory: "DeveloperApplication",
      },
    ],
  });

  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<link rel="canonical" href="${url}">
<meta name="description" content="${escapeHtml(opts.description)}">
<meta name="author" content="acoyfellow">
<meta name="keywords" content="cloudflare workers, mcp, model context protocol, browser automation, ai agents, dynamic workflows, worker loader, codemode, authenticated browser, durable objects">
<meta name="theme-color" content="#0a0a0f">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:locale" content="en_US">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@acoyfellow">
<meta name="twitter:creator" content="@acoyfellow">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(opts.description)}">
<meta name="twitter:image" content="${og}">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">

<script type="application/ld+json">${ld}</script>

<style>
  :root {
    color-scheme: light dark;
    --bg: #fafaf7;
    --ink: #111;
    --muted: #6b7280;
    --line: #111;
    --rule: rgba(17,17,17,.12);
    --accent: #c6531b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0f;
      --ink: #f4f4f5;
      --muted: #a1a1aa;
      --line: #f4f4f5;
      --rule: rgba(244,244,245,.12);
      --accent: #ff7a3c;
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    margin: 0;
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif;
    color: var(--ink); background: var(--bg);
    font-feature-settings: "ss01", "ss02";
  }
  a { color: inherit; text-underline-offset: 4px; }
  a:hover { color: var(--accent); }
  h1, h2, h3 { line-height: 1.15; letter-spacing: -0.01em; margin: 0; font-weight: 600; }
  h1 { font-size: 44px; }
  h2 { font-size: 26px; }
  h3 { font-size: 18px; }
  p { margin: 0; }
  ul, ol { margin: 0; padding-left: 22px; }
  li + li { margin-top: 4px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: var(--rule); padding: 1px 5px; border-radius: 3px; }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 0; }
  .tag {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }
  .btn {
    display: inline-block;
    padding: 12px 18px;
    border: 1px solid var(--line);
    text-decoration: none;
    background: transparent;
    color: var(--ink);
    border-radius: 6px;
    font-weight: 500;
    font-size: 14px;
  }
  .btn:hover { background: var(--ink); color: var(--bg); }
  .btn-primary { background: var(--ink); color: var(--bg); }
  .btn-primary:hover { background: var(--accent); border-color: var(--accent); }
  header, footer { padding: 24px 40px; }
  header { border-bottom: 1px solid var(--rule); }
  .nav { max-width: 920px; margin: 0 auto; display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .brand { font-size: 16px; font-weight: 600; text-decoration: none; letter-spacing: -0.01em; }
  .brand::after { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: 4px; vertical-align: 4px; }
  .nav-links { display: flex; gap: 20px; font-size: 14px; color: var(--muted); }
  .nav-links a { text-decoration: none; }
  main { max-width: 920px; margin: 0 auto; padding: 64px 40px; }
  section { padding: 56px 0; border-bottom: 1px solid var(--rule); }
  section:first-child { padding-top: 0; }
  section:last-child { border-bottom: 0; }
  .hero h1 { margin: 12px 0 24px; max-width: 18ch; }
  .lead { font-size: 18px; line-height: 1.55; max-width: 60ch; color: var(--ink); margin-top: 16px; }
  .actions { margin-top: 32px; display: flex; gap: 10px; flex-wrap: wrap; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
  @media (max-width: 720px) {
    main { padding: 32px 20px; }
    .grid-2 { grid-template-columns: 1fr; }
    h1 { font-size: 32px; }
    .hero h1 { max-width: none; }
  }
  footer { border-top: 1px solid var(--rule); color: var(--muted); font-size: 13px; }
  footer .nav { font-size: 13px; }
  .row { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; margin: 16px 0; }
  .row input { flex: 1; min-width: 240px; padding: 10px 14px; font: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .row textarea { width: 100%; min-height: 160px; padding: 12px 16px; font: ui-monospace, monospace; font-size: 13px; border: 1px solid var(--line); border-radius: 6px; background: #0d1117; color: #c9d1d9; resize: vertical; line-height: 1.55; }
  .row button { padding: 10px 18px; font: inherit; font-size: 14px; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; background: var(--ink); color: var(--bg); }
  .row button:disabled { opacity: 0.4; cursor: not-allowed; }
  .out { background: #0d1117; color: #c9d1d9; padding: 16px 18px; border-radius: 6px; font: 13px/1.55 ui-monospace, monospace; overflow-x: auto; white-space: pre-wrap; min-height: 60px; }
  .out.err { background: var(--accent); color: #fff; }
  /* Editable highlighted code cell. <textarea> overlaid on a <pre> mirror. */
  .cell { position: relative; background: #0d1117; border-radius: 8px; border: 1px solid var(--rule); overflow: hidden; }
  .cell-label { position: absolute; top: 8px; right: 12px; font: 11px/1 ui-monospace, monospace; color: #6e7681; letter-spacing: 0.08em; text-transform: uppercase; z-index: 3; pointer-events: none; }
  .cell-mirror, .cell-input { font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 18px 20px 20px; margin: 0; tab-size: 2; white-space: pre; word-wrap: normal; overflow-wrap: normal; }
  .cell-mirror { color: #c9d1d9; overflow-x: auto; pointer-events: none; min-height: 220px; }
  .cell-mirror code { font: inherit; background: transparent; padding: 0; }
  .cell-input { position: absolute; inset: 0; resize: none; border: 0; outline: 0; background: transparent; color: transparent; caret-color: #c9d1d9; overflow: auto; width: 100%; height: 100%; }
  .cell-input::selection { background: rgba(121,192,255,0.25); color: transparent; }
  .cell-result { background: #0d1117; color: #c9d1d9; border-radius: 8px; border: 1px solid var(--rule); padding: 18px 20px; font: 13px/1.55 ui-monospace, monospace; overflow-x: auto; }
  .cell-result .lbl { font-size: 11px; color: #6e7681; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 6px; }
  .cell-result pre { background: transparent; padding: 0; margin: 0; }
  .cell-result + .cell-result { margin-top: 12px; }
  .cell-hint { color: var(--muted); font-size: 13px; margin-top: 16px; line-height: 1.55; max-width: 60ch; }
  .cell-hint code { font-size: 12px; }
  .run-btn { margin-top: 14px; padding: 11px 22px; font: inherit; font-size: 14px; cursor: pointer; border: 1px solid var(--ink); border-radius: 6px; background: var(--ink); color: var(--bg); font-weight: 500; }
  .run-btn:hover { background: var(--accent); border-color: var(--accent); }
  .run-btn:disabled { opacity: 0.5; cursor: progress; }
  .box { border: 1px solid var(--rule); border-radius: 8px; padding: 18px 20px; background: var(--bg); }
  .box-label { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .box-after { border-color: var(--accent); }
  .box-after .box-label { color: var(--accent); }
  .box ol { font-size: 14px; line-height: 1.6; color: var(--ink); }
  .box ol li { margin-top: 6px; }
  table.caps { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 14px; line-height: 1.45; }
  table.caps th, table.caps td { padding: 12px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--rule); }
  table.caps th { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
  table.caps td.ok { color: #38a169; font-weight: 600; white-space: nowrap; width: 60px; }
  table.caps td.no { color: var(--accent); font-weight: 600; white-space: nowrap; width: 60px; }
  table.caps td a { color: var(--muted); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
  table.caps td a:hover { color: var(--accent); }
  pre.diagram { background: #0d1117; color: #c9d1d9; padding: 24px 20px; border-radius: 8px; overflow-x: auto; font: 13px/1.45 ui-monospace, monospace; margin: 24px 0 0; }
${TS_THEME_CSS}
</style>
</head>
<body>
<header>
  <nav class="nav">
    <a href="/" class="brand">${SITE_NAME}</a>
    <div class="nav-links">
      <a href="/demo">demo</a>
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">github</a>
      <a href="https://deploy.workers.cloudflare.com/?url=${GITHUB_URL}" target="_blank" rel="noopener">deploy</a>
    </div>
  </nav>
</header>
<main>
`;
}

const SHELL_FOOT = /* html */ `
</main>
<footer>
  <div class="nav">
    <span>${SITE_NAME} v0.0.1 &middot; MIT</span>
    <span><a href="${GITHUB_URL}">github.com/acoyfellow/echo</a></span>
  </div>
</footer>
</body>
</html>
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Real receipt captured from this Worker on 2026-05-28. Update by re-running
//   bun scripts/capture-receipt.ts  (or copy from `wf_...` output in dev logs)
const REAL_RECEIPT = JSON.stringify({
  planId: "wf_k0d1BlaWBeHd7Gn9Xhz1p",
  status: {
    status: "complete",
    output: {
      ok: true,
      result: { ok: false, error: "session_unbound" },
      logs: [
        "plan starting",
        'got: {"ok":false,"error":"session_unbound"}',
      ],
    },
  },
}, null, 2);

export async function renderLanding(): Promise<Response> {
  const planSample = await ts(`
// agent submits this — one MCP tool call
const { planId } = await mcp.echo.run(\`
  async ({ tab, log }) => {
    const r = await tab.execute({
      code: \\\`
        // runs in your tab's realm, with your session cookies
        const resp = await fetch("/rest/api/2/search?jql=assignee=currentUser()", {
          credentials: "include"
        });
        return await resp.json();
      \\\`
    });
    log("got " + r.result.issues.length + " tickets");
    return r.result;
  }
\`);
`);

  const receiptSample = await ts(REAL_RECEIPT);

  const html =
    shellHead({
      title: `${SITE_NAME} — a logged-in tab, as an MCP target`,
      description: SITE_DESC,
      path: "/",
    }) +
    /* html */ `
    <section class="hero">
      <div class="tag">v0.0.1 &middot; cloudflare worker, MV3 extension, MIT</div>
      <h1>${SITE_TAGLINE}</h1>
      <p class="lead">
        echo gives an MCP-compatible agent <strong>one revocable way</strong> to run code
        in a browser tab you've already signed into &mdash; for as long as that tab
        stays open.
        No cookie copying. No API tokens. No headless browser pretending to be you.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="/demo">try the demo</a>
        <a class="btn" href="https://deploy.workers.cloudflare.com/?url=${GITHUB_URL}">deploy your own</a>
        <a class="btn" href="${GITHUB_URL}">read the code</a>
      </div>
    </section>

    <section>
      <div class="tag">what this replaces</div>
      <h2 style="margin: 12px 0 24px;">Before &amp; after, one concrete task.</h2>
      <p style="color: var(--muted); font-size: 15px; line-height: 1.55; max-width: 60ch;">
        Task: <em>“summarize my open Jira tickets.”</em> You already have Jira open in a tab.
      </p>

      <div class="grid-2" style="margin-top: 24px;">
        <div class="box">
          <div class="box-label">before</div>
          <ol style="margin-top: 8px; padding-left: 18px;">
            <li>Generate a Jira API token. Scope it. (10 min, maybe a ticket to IT.)</li>
            <li>Store it where your agent can read it. (1Password? plaintext env? new attack surface either way.)</li>
            <li>Either run a headless browser with the cookie baked in, or write API code against the token.</li>
            <li>Hope the agent doesn't leak the token in a prompt, a log, or a cached chat.</li>
            <li>When the agent misbehaves, scramble to revoke the token.</li>
          </ol>
        </div>

        <div class="box box-after">
          <div class="box-label">after</div>
          <ol style="margin-top: 8px; padding-left: 18px;">
            <li>Open Jira in a tab. (You already have it open.)</li>
            <li>Click the echo icon. Approve.</li>
            <li>Tell your agent: “summarize my open tickets.”</li>
            <li>The workflow step log shows every snippet it ran and what came back.</li>
            <li>Close the tab. Session is dead. Nothing to revoke &mdash; there was no token.</li>
          </ol>
        </div>
      </div>
    </section>

    <section>
      <div class="tag">the one tool</div>
      <h2 style="margin: 12px 0 16px;">One MCP tool: <code>echo.run(plan)</code>.</h2>
      <p style="color: var(--muted); font-size: 15px; line-height: 1.55; max-width: 60ch;">
        The agent writes a JS function expression. The Worker runs it in a sandbox
        that has exactly one outbound: a WebSocket to your tab.
      </p>
      <div style="margin-top: 24px;">${planSample}</div>
    </section>

    <section>
      <div class="tag">trust model</div>
      <h2 style="margin: 12px 0 16px;">What plan code can and cannot do.</h2>
      <p style="color: var(--muted); font-size: 15px; line-height: 1.55; max-width: 60ch;">
        Every row links to the line of source that enforces it.
      </p>

      <table class="caps">
        <thead>
          <tr><th>capability</th><th>status</th><th>enforced by</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Read DOM, run <code>fetch()</code> with your session cookies on the tab's origin</td>
            <td class="ok">yes</td>
            <td><a href="${CITE.mainWorld}">background.ts</a></td>
          </tr>
          <tr>
            <td>Make cross-origin requests (subject to the browser's CORS rules)</td>
            <td class="ok">yes</td>
            <td>browser</td>
          </tr>
          <tr>
            <td>Reach the Worker's signing secret or other tabs' storage</td>
            <td class="no">no</td>
            <td><a href="${CITE.globalOutbound}">agent.ts &mdash; globalOutbound:&nbsp;null</a></td>
          </tr>
          <tr>
            <td>Talk to a different tab than the one you opened the session on</td>
            <td class="no">no</td>
            <td><a href="${CITE.tabIdPin}">background.ts &mdash; state.tabId pinned</a></td>
          </tr>
          <tr>
            <td>Survive after you close the tab</td>
            <td class="no">no</td>
            <td><a href="${CITE.tabCloseRevoke}">background.ts &mdash; chrome.tabs.onRemoved</a></td>
          </tr>
          <tr>
            <td>Be replayed by a stale or stolen token</td>
            <td class="no">no</td>
            <td><a href="${CITE.hmacFormat}">auth.ts &mdash; HMAC + expiry</a></td>
          </tr>
          <tr>
            <td>Be invoked from a different origin than the one the session was minted on</td>
            <td class="no">no</td>
            <td><a href="${CITE.originVerify}">auth.ts &mdash; origin pin verified</a></td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 24px; color: var(--muted); font-size: 14px; line-height: 1.55; max-width: 60ch;">
        <strong>You still have to trust the agent you give a session to.</strong>
        Inside the tab's origin, plan code can do anything the page's own JS could do.
        echo bounds the <em>blast radius</em>; it doesn't replace good judgment about who you let drive.
      </p>
    </section>

    <section>
      <div class="tag">real receipts</div>
      <h2 style="margin: 12px 0 16px;">Every run leaves an audit trail.</h2>
      <p style="color: var(--muted); font-size: 15px; line-height: 1.55; max-width: 60ch;">
        Every plan execution produces a workflow step log: the JS source it ran,
        every <code>log(...)</code> line, the final result. Below is real JSON returned
        by <code>mcp.echo.status(planId)</code> on this Worker. <code>session_unbound</code>
        is what you see when there's no extension attached &mdash; the supervisor refused to
        deliver code to a tab that hadn't been opened. That's the kill switch working.
      </p>
      <div style="margin-top: 24px;">${receiptSample}</div>
      <p style="margin-top: 16px; color: var(--muted); font-size: 14px;">
        Want to see one with a real result? <a href="/demo">Try the demo</a>.
      </p>
    </section>

    <section>
      <div class="tag">isolation</div>
      <h2 style="margin: 12px 0 16px;">Who sees what.</h2>
      <pre class="diagram">
  MCP client                  echo Worker                    Your browser tab
  ──────────                  ───────────                    ────────────────
  (Claude, Cursor) ───run(plan)───▶  EchoPlan workflow
                                       │
                              step.do  │
                                       ▼
                              Worker Loader sandbox
                              globalOutbound: null ─────ws──▶ your session
                                       │                          your cookies
                                  receipt
  &lt;──────status(planId)───── step log

  worker can NOT read tab DOM │ sandbox can NOT reach worker storage
  worker can NOT see cookies  │ sandbox can NOT reach the open internet
</pre>
    </section>

    <section>
      <div class="tag">what's under the hood</div>
      <h2 style="margin: 12px 0 24px;">Cloudflare-native, four primitives.</h2>
      <div class="grid-2">
        <div>
          <h3>Worker Loader</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            Per-call V8 isolate. <code>globalOutbound:&nbsp;null</code> means the only thing
            the sandbox can talk to is the <code>TAB</code> binding we hand it.
            <a href="${CITE.workerLoader}">source</a>.
          </p>
        </div>
        <div>
          <h3>Dynamic Workflows</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            Each plan is a workflow. Steps are durable, replay-safe, queryable for hours
            after the fact. Step history <em>is</em> the receipt chain.
            <a href="${CITE.workflow}">source</a>.
          </p>
        </div>
        <div>
          <h3>Durable Object &mdash; supervisor</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            One DO per session holds the WebSocket to your extension and routes
            sandbox → tab calls. The signing secret lives here, not in plans.
          </p>
        </div>
        <div>
          <h3>One MCP tool</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            <code>echo.run(plan)</code> + <code>echo.status(planId)</code>. That's it.
            Add the Worker URL to any MCP client.
            <a href="${CITE.mcpTool}">source</a>.
          </p>
        </div>
      </div>
    </section>

    <section>
      <div class="tag">deploy your own</div>
      <h2 style="margin: 12px 0 16px;">One worker, your account.</h2>
      <p style="color: var(--muted); font-size: 15px; line-height: 1.55; max-width: 60ch;">
        echo is a single Cloudflare Worker plus an MV3 browser extension.
        Click below to deploy it to your account; your data, your audit, your rate limits.
        The Worker is MIT, source is one repo.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="https://deploy.workers.cloudflare.com/?url=${GITHUB_URL}">deploy to cloudflare</a>
        <a class="btn" href="${GITHUB_URL}">read the source</a>
      </div>
    </section>
  ` +
    SHELL_FOOT;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export async function renderDemo(): Promise<Response> {
  const defaultPlan = `async ({ tab, log }) => {
  log("hello from the sandbox")
  const r = await tab.execute({
    code: \`return { url: location.href, title: document.title }\`,
  })
  return r
}`;
  const initialHighlight = await highlightText(defaultPlan, "ts", false);

  const html =
    shellHead({
      title: `${SITE_NAME} — try it`,
      description: `Write a plan, run it. Live against this Worker. ${SITE_DESC}`,
      path: "/demo",
    }) +
    /* html */ `
    <section class="hero">
      <div class="tag">try it &middot; live</div>
      <h1 style="max-width: 22ch;">Write a plan. Press run.</h1>
      <p class="lead" style="font-size: 17px;">
        This page is hitting <code>${SITE_URL}</code> directly. Edit the function, press run, see the receipt come back.
        With no extension attached, the call returns <code>session_unbound</code> &mdash; which <em>is</em> the system working.
      </p>
    </section>

    <section>
      <div class="cell">
        <div class="cell-label">plan.ts</div>
        <pre id="mirror" class="cell-mirror shj shj-lang-ts" aria-hidden="true">${initialHighlight}</pre>
        <textarea id="editor" class="cell-input" spellcheck="false" autocapitalize="off" autocorrect="off">${escapeHtml(defaultPlan)}</textarea>
      </div>
      <button id="run" class="run-btn">run</button>

      <div id="result-wrap" hidden>
        <div class="cell-result" style="margin-top: 28px;">
          <p class="lbl">workflow status</p>
          <pre id="result" class="shj shj-lang-ts"></pre>
        </div>
        <p id="hint" class="cell-hint" hidden></p>
      </div>
    </section>

<script type="module">
import { highlightText } from "https://cdn.jsdelivr.net/npm/@speed-highlight/core@1.2.15/dist/index.js";

const editor = document.getElementById("editor");
const mirror = document.getElementById("mirror");
const run = document.getElementById("run");
const resultEl = document.getElementById("result");
const resultWrap = document.getElementById("result-wrap");
const hint = document.getElementById("hint");

let signed = null;

function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function rehighlight() {
  // Trailing newline keeps the last line visible while typing.
  const src = editor.value + (editor.value.endsWith("\\n") ? " " : "\\n");
  try {
    mirror.innerHTML = await highlightText(src, "ts", false);
  } catch {
    mirror.textContent = src;
  }
}
rehighlight();

// Sync mirror with editor on every keystroke + keep scrolling aligned.
editor.addEventListener("input", rehighlight);
editor.addEventListener("scroll", () => {
  mirror.scrollTop = editor.scrollTop;
  mirror.scrollLeft = editor.scrollLeft;
});
// Indent on Tab instead of jumping focus.
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    rehighlight();
  }
});

async function ensureSession() {
  if (signed) return signed;
  const r = await fetch("/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: location.origin }),
  });
  if (!r.ok) throw new Error("failed to mint session");
  const body = await r.json();
  signed = body.signed;
  return signed;
}

async function showResult(value, hintText) {
  resultWrap.hidden = false;
  const json = JSON.stringify(value, null, 2);
  try {
    resultEl.innerHTML = await highlightText(json, "ts", false);
  } catch {
    resultEl.textContent = json;
  }
  if (hintText) {
    hint.hidden = false;
    hint.innerHTML = hintText;
  } else {
    hint.hidden = true;
  }
}

run.addEventListener("click", async () => {
  run.disabled = true;
  run.textContent = "running\u2026";
  try {
    const signedId = await ensureSession();
    const plan = editor.value;

    const r = await fetch("/mcp?id=" + encodeURIComponent(signedId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "run", arguments: { plan } },
      }),
    });
    const body = await r.json();
    const planId = body?.result?.structuredContent?.planId;
    if (!planId) {
      await showResult(body, "That's the run response, not a status. Likely a parse/auth issue.");
      return;
    }

    // Poll up to ~10s.
    for (let i = 0; i < 6; i++) {
      await new Promise(rr => setTimeout(rr, i === 0 ? 1500 : 1500));
      const sr = await fetch("/mcp?id=" + encodeURIComponent(signedId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "status", arguments: { planId } },
        }),
      });
      const sb = await sr.json();
      const status = sb?.result?.structuredContent?.status?.status;
      if (status === "complete" || status === "errored" || status === "terminated") {
        const output = sb.result.structuredContent;
        const err = output?.status?.output?.error || output?.status?.output?.result?.error;
        let h = null;
        if (err === "session_unbound") {
          h = '<strong>session_unbound</strong> means the supervisor refused to deliver code: no browser extension is attached to this session. Install <a href="' + ${JSON.stringify(GITHUB_URL)} + '">the extension</a> and run on a tab you\\'re signed into to see a real result.';
        }
        await showResult(output, h);
        return;
      }
      await showResult(sb.result.structuredContent, "polling\u2026");
    }
    hint.innerHTML = "Timed out after 10s. The workflow may still complete \u2014 try again.";
  } catch (e) {
    await showResult({ error: String(e) }, null);
  } finally {
    run.disabled = false;
    run.textContent = "run";
  }
});
</script>
  ` +
    SHELL_FOOT;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

// ---------- static assets ----------

const FAVICON_SVG = /* svg */ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="8" fill="#0a0a0f"/><text x="32" y="48" font-family="'Google Sans Code', ui-monospace, Menlo, monospace" font-weight="700" font-size="44" text-anchor="middle" fill="#f4f4f5" letter-spacing="-3">e</text><circle cx="49" cy="18" r="4" fill="#ff7a3c"/></svg>`;

const OG_SVG = /* svg */ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><rect width="1200" height="630" fill="#0a0a0f"/><line x1="80" y1="100" x2="1120" y2="100" stroke="#27272a" stroke-width="1"/><text x="80" y="80" font-family="'Google Sans Code', ui-monospace, Menlo, monospace" font-weight="500" font-size="20" fill="#52525b" letter-spacing="3">CODEMODE FOR THE AUTHENTICATED BROWSER</text><text x="80" y="260" font-family="'Google Sans Code', ui-monospace, Menlo, monospace" font-weight="700" font-size="140" fill="#f4f4f5" letter-spacing="-6">echo</text><circle cx="375" cy="195" r="14" fill="#ff7a3c"/><text x="80" y="340" font-family="'Google Sans Flex', ui-sans-serif, system-ui, sans-serif" font-weight="500" font-size="36" fill="#d4d4d8">Your tab is the agent's tab.</text><text x="80" y="392" font-family="'Google Sans Flex', ui-sans-serif, system-ui, sans-serif" font-weight="400" font-size="26" fill="#a1a1aa">A logged-in browser tab becomes a remote MCP target.</text><text x="80" y="430" font-family="'Google Sans Flex', ui-sans-serif, system-ui, sans-serif" font-weight="400" font-size="26" fill="#a1a1aa">The agent writes a plan; Cloudflare runs it; your tab does the work.</text><line x1="80" y1="490" x2="1120" y2="490" stroke="#27272a" stroke-width="1"/><g font-family="'Google Sans Code', ui-monospace, Menlo, monospace" font-size="20" fill="#d4d4d8"><text x="80" y="540"><tspan fill="#52525b">01 </tspan>worker loader</text><text x="80" y="572"><tspan fill="#52525b">02 </tspan>do facets</text><text x="380" y="540"><tspan fill="#52525b">03 </tspan>workflows</text><text x="380" y="572"><tspan fill="#52525b">04 </tspan>agents sdk</text><text x="680" y="540"><tspan fill="#52525b">05 </tspan>mcp tool: run(plan)</text><text x="680" y="572"><tspan fill="#52525b">06 </tspan>tab as ws binding</text></g><text x="1120" y="600" text-anchor="end" font-family="'Google Sans Code', ui-monospace, Menlo, monospace" font-size="18" fill="#52525b">github.com/acoyfellow/echo</text></svg>`;

export function renderFavicon(): Response {
  return new Response(FAVICON_SVG, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}

export function renderOg(): Response {
  return new Response(OG_SVG, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}

export function renderRobots(): Response {
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export function renderSitemap(): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/demo</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
