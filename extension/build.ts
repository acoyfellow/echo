#!/usr/bin/env bun
/**
 * Build the Chrome extension into ./extension/dist/.
 *
 * - bundles background.ts, content.ts, popup.ts, options.ts via Bun's bundler
 * - copies manifest.json, popup.html, options.html, icons/
 *
 * Load unpacked at chrome://extensions → Developer mode → Load unpacked.
 */

import { build } from "bun";
import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const root = new URL(".", import.meta.url).pathname;
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const entries = [
  { in: "background.ts", out: "background.js", format: "esm" as const },
  { in: "content.ts",    out: "content.js",    format: "iife" as const },
  { in: "popup.ts",      out: "popup.js",      format: "iife" as const },
  { in: "options.ts",    out: "options.js",    format: "iife" as const },
];

for (const e of entries) {
  const r = await build({
    entrypoints: [join(root, e.in)],
    outdir: dist,
    target: "browser",
    format: e.format,
    minify: false,
    sourcemap: "none",
    naming: e.out,
  });
  if (!r.success) {
    console.error("build failed for", e.in);
    for (const log of r.logs) console.error(log);
    process.exit(1);
  }
}

const manifest = JSON.parse(await Bun.file(join(root, "manifest.json")).text());
manifest.content_scripts = [
  { matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" },
];
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));

for (const f of ["popup.html", "options.html"]) await cp(join(root, f), join(dist, f));

const iconsSrc = join(root, "icons");
if (existsSync(iconsSrc)) await cp(iconsSrc, join(dist, "icons"), { recursive: true });

console.log(`extension built → ${dist}`);
console.log(`load unpacked: chrome://extensions → Developer mode → Load unpacked → ${dist}`);
