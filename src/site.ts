export const SITE_URL = "https://echo.coey.dev";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#080b0f"/><path d="M17 34c0-11 7-18 17-18 9 0 15 6 15 15v5H27c1 7 5 10 11 10 4 0 7-1 10-3v8c-3 2-7 3-12 3-12 0-19-8-19-20Zm10-5h12c0-4-2-6-6-6-3 0-5 2-6 6Z" fill="#f8fafc"/><circle cx="51" cy="13" r="5" fill="#ff7a18"/></svg>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><radialGradient id="g"><stop stop-color="#61300f"/><stop offset="1" stop-color="#080b0f"/></radialGradient></defs><rect width="1200" height="630" fill="#080b0f"/><rect width="1200" height="630" fill="url(#g)" opacity=".7"/><text x="70" y="82" font-family="monospace" font-size="20" font-weight="700" fill="#ffc14d" letter-spacing="4">THE CASING IS OFF</text><text x="70" y="250" font-family="sans-serif" font-weight="800" font-size="78" fill="#f8fafc">Your app already knows</text><text x="70" y="345" font-family="sans-serif" font-weight="800" font-size="78" fill="#f8fafc">what to do.</text><text x="70" y="455" font-family="sans-serif" font-weight="800" font-size="58" fill="#ff7a18">Give those functions to an agent.</text><path d="M80 545H1120" stroke="#ff7a18" stroke-width="3"/><circle cx="835" cy="545" r="10" fill="#fff"/></svg>`;

export function renderFavicon(): Response { return new Response(favicon, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } }); }
export function renderOg(): Response { return new Response(og, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } }); }
export function renderRobots(): Response { return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8" } }); }
export function renderSitemap(): Response {
  const paths = ["/", "/examples/", "/examples/todo/", "/examples/notes/"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
