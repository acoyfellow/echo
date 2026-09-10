const html = (await Bun.file(new URL("../public/demo/index.html", import.meta.url)).text())
  .replace('data-worker-base=""', 'data-worker-base="http://127.0.0.1:8870"');
const script = Bun.file(new URL("../public/echo-demo.js", import.meta.url));

Bun.serve({
  hostname: "127.0.0.1",
  port: 8871,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/demo/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "/echo-demo.js") return new Response(script, { headers: { "content-type": "text/javascript; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
});

console.log("Cross-origin fixture ready at http://127.0.0.1:8871");
