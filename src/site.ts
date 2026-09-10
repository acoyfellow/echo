export const SITE_URL = "https://echo.coey.dev";
export const GITHUB_URL = "https://github.com/acoyfellow/echo";

const description = "Let an agent use capabilities exposed by one user-approved live app tab.";

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Echo — agents in your live app tab</title>
<meta name="description" content="${description}">
<meta property="og:title" content="Echo — agents in your live app tab">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${SITE_URL}/og.svg">
<meta property="og:url" content="${SITE_URL}/">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:dark;--ink:#0b1118;--layer:#111a24;--layer2:#182431;--text:#f7f9fb;--muted:#9baaba;--orange:#f6821f;--amber:#f7b53b;--blue:#71b8d8;--green:#63d5a2;--red:#ff7d68;--border:rgba(174,196,216,.14);background:var(--ink);color:var(--text);font:16px/1.6 Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,rgba(247,181,59,.18),transparent 32rem),linear-gradient(rgba(113,184,216,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(113,184,216,.025) 1px,transparent 1px),var(--ink);background-size:auto,32px 32px,32px 32px}a{color:var(--blue)}nav,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}nav{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}nav strong{font-size:20px;letter-spacing:-.03em}.navlinks{display:flex;gap:20px}.navlinks a{color:var(--muted);text-decoration:none}.hero{padding:112px 0 88px;max-width:940px}.eyebrow{color:var(--amber);font:700 12px/1.2 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}.eyebrow:before{content:"[ ";color:var(--orange)}.eyebrow:after{content:" ]";color:var(--orange)}h1,h2,h3{letter-spacing:-.03em;line-height:1.06}h1{font-size:clamp(48px,8vw,88px);margin:24px 0;max-width:12ch}h2{font-size:clamp(30px,5vw,48px);margin:0 0 18px}h3{font-size:21px;margin:0 0 10px}.lead{font-size:clamp(19px,2.5vw,24px);color:var(--muted);max-width:720px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:36px}.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:.45rem;padding:12px 18px;color:var(--text);text-decoration:none;font-weight:750}.button.primary{background:var(--orange);border-color:var(--orange);color:var(--ink)}section{padding:80px 0;border-top:1px solid var(--border)}.sectionhead{max-width:720px;margin-bottom:34px}.sectionhead p,.card p,.limit{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{padding:24px;border:1px solid var(--border);border-radius:.7rem;background:linear-gradient(145deg,rgba(255,255,255,.035),transparent),var(--layer)}.number{display:block;color:var(--orange);font:700 12px "IBM Plex Mono",ui-monospace,monospace;margin-bottom:28px}pre,code{font-family:"IBM Plex Mono",ui-monospace,monospace}pre{margin:0;padding:24px;border:1px solid var(--border);border-radius:.7rem;background:#080d12;color:#dbe7ef;overflow:auto;line-height:1.7}.flow{color:var(--blue)}.proof{display:grid;grid-template-columns:1fr 1fr;gap:16px}.proof strong{color:var(--green)}ul{padding-left:20px}.limits{display:grid;grid-template-columns:1fr 1fr;gap:24px}.limits li{margin:10px 0;color:var(--muted)}footer{padding:34px 0 50px;border-top:1px solid var(--border);display:flex;justify-content:space-between;color:var(--muted)}@media(max-width:760px){.grid,.proof,.limits{grid-template-columns:1fr}.hero{padding:72px 0 60px}.navlinks a:first-child{display:none}section{padding:58px 0}footer{display:block}}
</style>
</head>
<body>
<nav><strong>echo</strong><div class="navlinks"><a href="/demo/">Live demo</a><a href="${GITHUB_URL}">GitHub</a></div></nav>
<main>
<header class="hero">
<div class="eyebrow">One tab. Explicit access.</div>
<h1>Let an agent work in your app.</h1>
<p class="lead">Your app chooses the actions. Your user connects the current tab. Their login stays in the browser. Stop ends access.</p>
<div class="actions"><a class="button primary" href="/demo/">Try the live tab demo</a><a class="button" href="${GITHUB_URL}">Read the source</a></div>
</header>
<section>
<div class="sectionhead"><div class="eyebrow">How it works</div><h2>The app stays in control.</h2><p>Echo is not general browser automation. It carries small, named app actions between an agent and one approved tab.</p></div>
<div class="grid">
<div class="card"><span class="number">01</span><h3>Register actions</h3><p>The app publishes names, input shapes, output shapes, and whether each action reads or changes data.</p></div>
<div class="card"><span class="number">02</span><h3>Connect this tab</h3><p>The user sees what the agent can do and starts one short session for the current app and origin.</p></div>
<div class="card"><span class="number">03</span><h3>Watch and stop</h3><p>Activity stays visible. The Stop button closes the page connection and later calls fail.</p></div>
</div>
</section>
<section>
<div class="sectionhead"><div class="eyebrow">Small integration</div><h2>Expose only what the agent needs.</h2></div>
<pre><code>const echo = createEcho({
  workerBase: 'https://your-echo-worker.example',
  appId: 'notes',
});

echo.register({
  readState: capability({ effect: 'read' }, readState),
  setDraft: capability({ effect: 'mutation' }, setDraft),
});

connectButton.onclick = () =&gt; echo.connect();
stopButton.onclick = () =&gt; echo.stop();</code></pre>
</section>
<section>
<div class="sectionhead"><div class="eyebrow">The path</div><h2>No extension. No debugging port.</h2></div>
<pre class="flow">agent → Echo Worker → session Durable Object → approved page connection → app capability</pre>
<p class="limit">The production path uses normal HTTPS and WebSocket APIs. Browser test tools observe the result. They do not carry product traffic.</p>
</section>
<section>
<div class="sectionhead"><div class="eyebrow">Proof</div><h2>Failures count, too.</h2><p>Echo records exact browser versions and visible page results. Its own success response is never enough.</p></div>
<div class="proof">
<div class="card"><strong>Safari 26.4 · passed</strong><p>Read, mutation, duplicate protection, denied action, uncertain outcome, and Stop were observed in the live page.</p></div>
<div class="card"><strong>Chrome 150 · passed</strong><p>Read, mutation, duplicate protection, and Stop were observed in the live page. See the repository receipt for the referee limitation.</p></div>
</div>
</section>
<section>
<div class="sectionhead"><div class="eyebrow">Limits</div><h2>A page is not a browser controller.</h2></div>
<div class="limits">
<ul><li>Echo cannot control browser chrome or another origin.</li><li>Echo cannot create trusted keyboard or pointer input.</li><li>Echo cannot approve its own access or press its own Stop button.</li></ul>
<ul><li>Only apps that add Echo can use it.</li><li>The app remains responsible for every capability and shared result.</li><li>Echo does not protect an app from its own JavaScript or XSS.</li></ul>
</div>
</section>
</main>
<footer><span>Echo 0.0.1 · MIT</span><a href="${GITHUB_URL}">github.com/acoyfellow/echo</a></footer>
</body>
</html>`;
}

export function renderLanding(): Response {
  return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#0b1118"/><path d="M17 34c0-11 7-18 17-18 9 0 15 6 15 15v5H27c1 7 5 10 11 10 4 0 7-1 10-3v8c-3 2-7 3-12 3-12 0-19-8-19-20Zm10-5h12c0-4-2-6-6-6-3 0-5 2-6 6Z" fill="#f7f9fb"/><circle cx="51" cy="13" r="5" fill="#f6821f"/></svg>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><radialGradient id="g"><stop stop-color="#5b3517"/><stop offset="1" stop-color="#0b1118"/></radialGradient></defs><rect width="1200" height="630" fill="#0b1118"/><rect width="1200" height="630" fill="url(#g)" opacity=".55"/><text x="80" y="95" font-family="monospace" font-size="22" font-weight="700" fill="#f7b53b" letter-spacing="4">[ ONE TAB · EXPLICIT ACCESS ]</text><text x="80" y="285" font-family="sans-serif" font-weight="800" font-size="86" fill="#f7f9fb">Let an agent work</text><text x="80" y="390" font-family="sans-serif" font-weight="800" font-size="86" fill="#f7f9fb">in your app.</text><text x="80" y="500" font-family="sans-serif" font-size="30" fill="#9baaba">No extension. No debugging port. The app stays in control.</text><circle cx="1100" cy="90" r="18" fill="#f6821f"/></svg>`;

export function renderFavicon(): Response {
  return new Response(favicon, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}

export function renderOg(): Response {
  return new Response(og, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}

export function renderRobots(): Response {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function renderSitemap(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url></urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
