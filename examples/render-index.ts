import { examples } from "./catalog";

const cards = examples
  .map(
    (
      example,
    ) => `<${example.live ? "a" : "article"} class="card${example.live ? " live" : ""}" ${example.live ? `href="/examples/${example.slug}/"` : ""} style="--accent:${example.color}">
<div class="top"><span class="emoji">${example.emoji}</span><span class="status">${example.live ? "play now" : "next up"}</span></div>
<h2>${example.name}</h2><p>${example.description}</p>
<div class="tools">${example.tools.map((tool) => `<span>${tool}</span>`).join("")}</div>
<blockquote>“${example.prompt}”</blockquote>
</${example.live ? "a" : "article"}>`,
  )
  .join("");

export const examplesPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Echo examples — little apps for agents</title>
<meta name="description" content="Small web apps you can connect to an agent with Echo.">
<style>
:root{color-scheme:dark;--ink:#0b1118;--layer:#111a24;--text:#f7f9fb;--muted:#9baaba;--orange:#f6821f;--border:rgba(174,196,216,.14);background:var(--ink);color:var(--text);font:16px/1.55 Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% -5%,rgba(246,130,31,.17),transparent 34rem),var(--ink)}nav,main,footer{width:min(1180px,calc(100% - 40px));margin:auto}nav{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}nav a{color:var(--muted);text-decoration:none}nav strong{color:var(--text);font-size:20px}.hero{padding:82px 0 54px}.eyebrow{color:#f7b53b;font:700 11px monospace;letter-spacing:.17em;text-transform:uppercase}h1{max-width:11ch;margin:14px 0;font-size:clamp(48px,8vw,86px);line-height:.98;letter-spacing:-.055em}.hero p{max-width:630px;color:var(--muted);font-size:20px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding-bottom:80px}.card{display:flex;flex-direction:column;min-height:350px;padding:21px;border:1px solid var(--border);border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 45%),var(--layer);color:var(--text);text-decoration:none;opacity:.64}.card.live{opacity:1;transition:transform .18s,border-color .18s}.card.live:hover{transform:translateY(-4px);border-color:var(--accent)}.top{display:flex;justify-content:space-between;align-items:center}.emoji{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent);font-size:22px}.status{color:var(--accent);font:700 10px monospace;letter-spacing:.12em;text-transform:uppercase}h2{margin:22px 0 8px;font-size:22px;letter-spacing:-.03em}.card p{margin:0;color:var(--muted);font-size:14px}.tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:18px}.tools span{padding:4px 7px;border:1px solid var(--border);border-radius:5px;color:#b7c5d2;font:10px monospace}blockquote{margin:auto 0 0;padding-top:20px;color:var(--accent);font-size:13px;font-style:italic}footer{padding:30px 0 50px;border-top:1px solid var(--border);color:var(--muted)}@media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:580px){.grid{grid-template-columns:1fr}.hero{padding-top:58px}.card{min-height:300px}}
</style>
</head>
<body><nav><a href="/"><strong>echo</strong></a><a href="https://github.com/acoyfellow/echo">GitHub</a></nav><main><header class="hero"><div class="eyebrow">The playground</div><h1>Little apps. Real agent tools.</h1><p>Every example is a complete web app with a tiny surface an agent can use. Open one, connect it, and spend a few tokens playing.</p></header><section class="grid">${cards}</section></main><footer>Two live. Fourteen strange little ideas waiting their turn.</footer></body></html>`;
