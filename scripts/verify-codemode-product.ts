export {};

const origin = process.env.ECHO_PRODUCT_ORIGIN ?? "http://127.0.0.1:8870";
const failures: string[] = [];

const extensionBuild = Bun.spawnSync(["bun", "run", "build:extension"], { stdout: "ignore", stderr: "inherit" });
if (extensionBuild.exitCode !== 0) failures.push("extension build failed");
const background = await Bun.file("extension/dist/background.js").text();
if (!background.includes("https://echo.coey.dev")) failures.push("default companion does not use the hosted broker");
if (background.includes("http://127.0.0.1:8870")) failures.push("default companion contains the local broker");

for (const [path, text] of [["/", "Give your agent a live tab."], ["/demo/", "Codemode target"]] as const) {
  const response = await fetch(`${origin}${path}`).catch(() => null);
  const html = response ? await response.text() : "";
  if (!response?.ok || !html.includes(text)) failures.push(`${path} is not the Codemode product route`);
}
for (const path of ["/examples/", "/examples/todo/", "/spike/owner-cut/"]) {
  const response = await fetch(`${origin}${path}`).catch(() => null);
  if (response?.status !== 404) failures.push(`${path} is still public`);
}

const sitemap = await fetch(`${origin}/sitemap.xml`).then((response) => response.text()).catch(() => "");
if (!sitemap.includes("https://echo.coey.dev/demo/") || sitemap.includes("/examples/") || sitemap.includes("/spike/")) failures.push("sitemap is not consolidated");
const readme = await Bun.file("README.md").text();
for (const required of ["## Install", "page_evaluate", "Load unpacked", "one exact tab", "Stop does not undo"]) {
  if (!readme.includes(required)) failures.push(`README is missing: ${required}`);
}
for (const stale of ["createEcho", "sixteen playable", "app-defined mode", "echo_call_capability"]) {
  if (readme.includes(stale)) failures.push(`README still contains: ${stale}`);
}
const demo = await Bun.file("src/ui/Demo.svelte").text();
if (demo.includes("createEcho") || demo.includes("/sessions") || demo.includes("/mcp")) failures.push("Todo target is coupled to Echo");
const packageJson = await Bun.file("package.json").json() as { exports?: unknown; scripts?: Record<string, string> };
if (packageJson.exports) failures.push("the removed capability client is still exported");
if (packageJson.scripts?.["e2e:examples"] || packageJson.scripts?.["verify:extension-free"]) failures.push("removed product scripts remain");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: Echo is one Codemode product with one uncoupled Todo target and a hosted-default companion build");
