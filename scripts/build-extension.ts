import { mkdir, rm } from "node:fs/promises";

const output = new URL("../extension/dist", import.meta.url).pathname;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [
    new URL("../extension/background.ts", import.meta.url).pathname,
    new URL("../extension/popup.ts", import.meta.url).pathname,
  ],
  outdir: output,
  naming: "[name].js",
  target: "browser",
  format: "esm",
  minify: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("Built Echo Codemode browser companion");
