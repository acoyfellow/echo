const result = await Bun.build({
  entrypoints: [new URL("../demo/app.ts", import.meta.url).pathname],
  outdir: new URL("../public", import.meta.url).pathname,
  naming: "echo-demo.js",
  target: "browser",
  format: "esm",
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log("Built public/echo-demo.js");
