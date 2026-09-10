import { mkdir, writeFile } from "node:fs/promises";

const publicDirectory = new URL("../public", import.meta.url).pathname;
const result = await Bun.build({
  entrypoints: [new URL("../demo/app.ts", import.meta.url).pathname],
  outdir: publicDirectory,
  naming: "echo-demo.js",
  target: "browser",
  format: "esm",
  minify: true,
});

if (!result.success || !result.outputs[0]) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const template = await Bun.file(new URL("../demo/index.html", import.meta.url)).text();
const script = await result.outputs[0].text();
await mkdir(new URL("../public/demo", import.meta.url).pathname, { recursive: true });
await writeFile(new URL("../public/demo/index.html", import.meta.url), template.replace("__ECHO_CLIENT__", script));
console.log("Built the inline extension-free demo");
