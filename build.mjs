import { mkdirSync } from "node:fs";
import { build } from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { buildHonoSvelteClientArtifacts } from "svelte-hono/build";

const tailwind = Bun.spawnSync(["bunx", "@tailwindcss/cli", "-i", "./src/ui/input.css", "-o", "./public/site.css", "--minify"], { stdout: "inherit", stderr: "inherit" });
if (tailwind.exitCode !== 0) process.exit(tailwind.exitCode);

mkdirSync("./generated", { recursive: true });

const components = {
  home: "./ui/Home.svelte",
  examples: "./ui/Examples.svelte",
  todo: "../examples/todo/App.svelte",
  notes: "../examples/notes/App.svelte",
};

await buildHonoSvelteClientArtifacts({
  workerEntry: "./src/index.ts",
  outDir: "./build",
  components,
  bundlesFile: "../generated/bundles.generated.ts",
});

await build({
  entryPoints: ["./src/index.ts"],
  outfile: "./build/worker.bundled.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  conditions: ["workerd", "worker", "browser", "node", "import"],
  external: ["cloudflare:*"],
  plugins: [sveltePlugin({ compilerOptions: { generate: "server", css: "external" } })],
});

console.log("Built Echo Svelte/Hono Worker");
