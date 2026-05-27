/**
 * Public docs site, served from the same Worker. One file, no build step.
 *
 * Routes:
 *   GET /              landing
 *   GET /demo          live demo (mint + run a plan, show step log)
 *
 * The demo IS dogfooding: it mints a real session against this worker, runs
 * a real plan, polls real status, surfaces real receipts. No fakery.
 */

const SHELL_HEAD = /* html */ `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>echo &mdash; your tab, an MCP server</title>
<meta name="description" content="A logged-in browser tab becomes a remote target for an MCP agent. The agent writes a plan; Cloudflare runs it; your tab does the work.">
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
      --bg: #0e0e0e;
      --ink: #f4f4f4;
      --muted: #9ca3af;
      --line: #f4f4f4;
      --rule: rgba(244,244,244,.16);
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
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
  pre { background: var(--ink); color: var(--bg); padding: 20px 24px; border-radius: 6px; overflow-x: auto; line-height: 1.55; margin: 0; }
  pre code { font-size: inherit; }
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
  .row textarea { width: 100%; min-height: 120px; padding: 10px 14px; font: ui-monospace, monospace; font-size: 13px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); resize: vertical; line-height: 1.5; }
  .row button { padding: 10px 18px; font: inherit; font-size: 14px; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; background: var(--ink); color: var(--bg); }
  .row button:disabled { opacity: 0.4; cursor: not-allowed; }
  .out { background: var(--ink); color: var(--bg); padding: 16px 18px; border-radius: 6px; font: 13px/1.55 ui-monospace, monospace; overflow-x: auto; white-space: pre-wrap; min-height: 60px; }
  .out.err { background: var(--accent); color: #fff; }
</style>
</head>
<body>
<header>
  <nav class="nav">
    <a href="/" class="brand">echo</a>
    <div class="nav-links">
      <a href="/demo">demo</a>
      <a href="https://github.com/acoyfellow/echo" target="_blank" rel="noopener">github</a>
      <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/echo" target="_blank" rel="noopener">deploy</a>
    </div>
  </nav>
</header>
<main>
`;

const SHELL_FOOT = /* html */ `
</main>
<footer>
  <div class="nav">
    <span>echo v0.0.1 &middot; MIT</span>
    <span><a href="https://github.com/acoyfellow/echo">github.com/acoyfellow/echo</a></span>
  </div>
</footer>
</body>
</html>
`;

export function renderLanding(): Response {
  const html = SHELL_HEAD + /* html */ `
    <section class="hero">
      <div class="tag">v0.0.1 &middot; cloudflare workers + dynamic workflows + dynamic workers + facets</div>
      <h1>Your tab is the agent's tab.</h1>
      <p class="lead">
        echo turns a logged-in browser tab into a remote target for an MCP agent.
        The agent writes a plan; Cloudflare runs it as a durable workflow
        whose steps execute code in your tab; the receipt is the workflow's step log.
        No tokens. No headless Chrome. No credential vault.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/echo">deploy to cloudflare</a>
        <a class="btn" href="/demo">try the demo</a>
        <a class="btn" href="https://github.com/acoyfellow/echo">github</a>
      </div>
    </section>

    <section>
      <div class="tag">how it works</div>
      <h2 style="margin: 12px 0 16px;">One tool: <code>echo.run(plan)</code>.</h2>
      <p class="lead" style="font-size: 16px;">
        The agent submits a JS function expression. The Worker runs it in a Worker
        Loader sandbox whose only outbound is a binding to your authenticated tab.
        Each step is durable, replayable, and writes a receipt.
      </p>
<pre style="margin-top: 32px;"><code>const { planId } = await mcp.echo.run(\`
  async ({ tab, log }) => {
    const r = await tab.execute({
      code: \\\`
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
</code></pre>
    </section>

    <section>
      <div class="tag">primitives</div>
      <h2 style="margin: 12px 0 24px;">The May-2026 cloudflare composition.</h2>
      <div class="grid-2">
        <div>
          <h3>Dynamic Workers</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            The plan runs in a per-call V8 isolate with <code>globalOutbound:&nbsp;null</code>.
            13ms cold-start. No way to reach the supervisor's storage or signing key.
          </p>
        </div>
        <div>
          <h3>DO Facets</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            Each plan gets its own SQLite scratch DB inside the session DO.
            The supervisor cannot read it.
          </p>
        </div>
        <div>
          <h3>Dynamic Workflows</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            Plans are durable: sleep for hours, survive tab close,
            replay on retry. Step history <em>is</em> the receipt chain.
          </p>
        </div>
        <div>
          <h3>cloudflare/agents SDK</h3>
          <p style="margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.55;">
            Glues the WebSocket transport, sub-agents-as-facets,
            and the workflow integration. One dependency.
          </p>
        </div>
      </div>
    </section>

    <section>
      <div class="tag">trust posture</div>
      <h2 style="margin: 12px 0 16px;">Codex-grade. No more, no less.</h2>
      <p class="lead" style="font-size: 16px;">
        OpenAI's Codex desktop app already gives a remote agent your authenticated browser.
        echo does the same thing&mdash;but the browser stays on your machine, and the agent
        can be any MCP client. Same trust model. Different blast radius.
      </p>
      <ul style="margin-top: 24px; max-width: 60ch;">
        <li>Session is HMAC-signed to one tab origin.</li>
        <li>Closing the tab revokes the session.</li>
        <li>Plan code runs in your tab's same-origin realm&mdash;you sign in once, normally.</li>
        <li>Worker never sees your cookies; tab handles credentials via <code>credentials:&nbsp;"include"</code>.</li>
        <li>Every step is a durable receipt in the workflow's history.</li>
      </ul>
    </section>

    <section>
      <div class="tag">deploy your own</div>
      <h2 style="margin: 12px 0 16px;">One worker. Your account.</h2>
      <p class="lead" style="font-size: 16px;">
        echo is a single Cloudflare Worker. Click below to deploy it to your own
        account. Your data, your audit, your rate limits.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/echo">deploy to cloudflare</a>
        <a class="btn" href="https://github.com/acoyfellow/echo">read the source</a>
      </div>
    </section>
  ` + SHELL_FOOT;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export function renderDemo(): Response {
  const html = SHELL_HEAD + /* html */ `
    <section class="hero">
      <div class="tag">live demo &middot; this worker</div>
      <h1>Run a real plan.</h1>
      <p class="lead">
        Mints a real signed session against this worker. Submits a plan. Polls
        until done. Every byte you see came from a real workflow on a real
        Cloudflare Durable Object.
        <strong>No extension required for the demo</strong>&mdash;the plan calls
        <code>tab.execute(...)</code> which returns <code>session_closed</code>
        because no extension is attached. That's the proof: your tab is the only
        thing that can fulfill calls.
      </p>
    </section>

    <section>
      <div class="tag">step 01 &middot; mint a session</div>
      <h2 style="margin: 12px 0 16px;">Origin-bound HMAC-signed.</h2>
      <p style="color: var(--muted); font-size: 14px; line-height: 1.55;">
        Any origin works for the demo. echo signs a session id pinned to it.
      </p>
      <div class="row">
        <input id="origin" value="https://example.com" placeholder="https://example.com" />
        <button id="mint">mint</button>
      </div>
      <div id="mintOut" class="out" hidden></div>
    </section>

    <section>
      <div class="tag">step 02 &middot; submit a plan</div>
      <h2 style="margin: 12px 0 16px;">A JS function expression.</h2>
      <p style="color: var(--muted); font-size: 14px; line-height: 1.55;">
        Your plan receives <code>{ tab, log }</code>. <code>tab.execute({code})</code>
        runs the code in the page realm. <code>log(...)</code> writes to the receipt.
      </p>
      <div class="row">
        <textarea id="plan">async ({ tab, log }) =&gt; {
  log("plan starting");
  const r = await tab.execute({
    code: \`
      const resp = await fetch("/", { credentials: "include" });
      return { status: resp.status, ok: resp.ok };
    \`
  });
  log("got " + JSON.stringify(r));
  return r;
}</textarea>
      </div>
      <div class="row" style="margin-top: 0;">
        <button id="run" disabled>submit plan</button>
      </div>
      <div id="runOut" class="out" hidden></div>
    </section>

    <section>
      <div class="tag">step 03 &middot; status</div>
      <h2 style="margin: 12px 0 16px;">Workflow step history.</h2>
      <p style="color: var(--muted); font-size: 14px; line-height: 1.55;">
        Polls <code>echo.status(planId)</code>. Step history is the receipt chain.
      </p>
      <div id="statusOut" class="out" hidden></div>
    </section>

    <section>
      <div class="tag">try it for real</div>
      <h2 style="margin: 12px 0 16px;">Install the extension, run the plan against your own logged-in tab.</h2>
      <p style="color: var(--muted); font-size: 14px; line-height: 1.55;">
        The demo runs against the live worker but with no extension attached.
        Install echo, open a tab you're already logged into, and the same plan
        will hit real APIs through your session.
      </p>
      <div class="actions" style="margin-top: 24px;">
        <a class="btn btn-primary" href="https://github.com/acoyfellow/echo">get the extension</a>
        <a class="btn" href="/">back to home</a>
      </div>
    </section>

<script>
let signed = null;

function show(id, body, isErr) {
  const el = document.getElementById(id);
  el.hidden = false;
  el.textContent = body;
  el.classList.toggle("err", !!isErr);
}

async function jsonOrText(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

document.getElementById("mint").addEventListener("click", async () => {
  const btn = document.getElementById("mint");
  btn.disabled = true;
  btn.textContent = "minting...";
  try {
    const r = await fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: document.getElementById("origin").value }),
    });
    const body = await jsonOrText(r);
    if (!r.ok) { show("mintOut", JSON.stringify(body, null, 2), true); return; }
    signed = body.signed;
    show("mintOut", JSON.stringify(body, null, 2));
    document.getElementById("run").disabled = false;
  } catch (e) {
    show("mintOut", String(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "mint";
  }
});

document.getElementById("run").addEventListener("click", async () => {
  if (!signed) return;
  const btn = document.getElementById("run");
  btn.disabled = true;
  btn.textContent = "running...";
  try {
    const plan = document.getElementById("plan").value;
    const r = await fetch("/mcp?id=" + encodeURIComponent(signed), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "run", arguments: { plan } },
      }),
    });
    const body = await jsonOrText(r);
    show("runOut", JSON.stringify(body, null, 2));
    const planId = body?.result?.structuredContent?.planId;
    if (!planId) return;
    await new Promise(rr => setTimeout(rr, 2500));
    const sr = await fetch("/mcp?id=" + encodeURIComponent(signed), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "status", arguments: { planId } },
      }),
    });
    show("statusOut", JSON.stringify(await jsonOrText(sr), null, 2));
  } catch (e) {
    show("runOut", String(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "submit plan";
  }
});
</script>
  ` + SHELL_FOOT;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
