import { $ } from "bun";

const origin = process.env.ECHO_PRODUCTION_URL ?? "https://echo.coey.dev";
const failures: string[] = [];
let liveCommit = "";

async function read(path: string): Promise<{ response: Response; text: string }> {
  const response = await fetch(`${origin}${path}`, { redirect: "follow" });
  return { response, text: await response.text() };
}

try {
  const health = await read("/health");
  if (health.response.status !== 200) failures.push(`health returned ${health.response.status}`);
  const healthBody = JSON.parse(health.text) as { ok?: boolean; version?: string; mode?: string; commit?: string };
  if (!healthBody.ok || healthBody.version !== "0.0.1" || healthBody.mode !== "prod") failures.push("health payload is not production 0.0.1");
  liveCommit = healthBody.commit ?? "";

  const landing = await read("/");
  if (landing.response.status !== 200) failures.push(`landing returned ${landing.response.status}`);
  for (const text of ["Let an agent work in your app.", "No extension. No debugging port.", "The app stays in control."]) {
    if (!landing.text.includes(text)) failures.push(`landing is missing: ${text}`);
  }
  for (const stale of ["WebMCP over MCP", "webmcp_list_tools", "Echo extension →"]) {
    if (landing.text.includes(stale)) failures.push(`landing contains stale copy: ${stale}`);
  }

  const demo = await read("/demo/");
  if (demo.response.status !== 200 || !demo.text.includes("Connect this tab") || !demo.text.includes("Stop agent access")) failures.push("production demo is unavailable");

  const unauthorized = await fetch(`${origin}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: "https://wrong-origin.example",
      appId: "echo-notes-demo",
      capabilities: [{ name: "readState", effect: "read" }],
    }),
  });
  if (unauthorized.status !== 403) failures.push(`wrong-origin session mint returned ${unauthorized.status}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

const receipt = Bun.file("receipts/production/receipt.json");
if (!await receipt.exists()) failures.push("production browser receipt is missing");
else {
  const text = await receipt.text();
  const value = JSON.parse(text) as {
    status?: string;
    origin?: string;
    workerVersionId?: string;
    deployedCommit?: string;
    independentEvidence?: string[];
    screenshot?: { path?: string; sha256?: string; visibleState?: string[] };
  };
  if (value.status !== "passed" || value.origin !== origin || !value.independentEvidence?.length) failures.push("production browser receipt is incomplete");
  if (!value.workerVersionId || !value.deployedCommit || value.deployedCommit.length !== 40) failures.push("production deployment identity is incomplete");
  else {
    const head = (await $`git rev-parse HEAD`.text()).trim();
    const ancestor = await $`git merge-base --is-ancestor ${value.deployedCommit} ${head}`.quiet().nothrow();
    if (ancestor.exitCode !== 0) failures.push("production commit is not an ancestor of the verified source");
    else {
      const changed = (await $`git diff --name-only ${value.deployedCommit}..${head}`.text()).trim().split("\n").filter(Boolean);
      const unbound = changed.filter((path) => !path.startsWith("receipts/production/") && !path.startsWith("receipts/reviews/"));
      if (unbound.length) failures.push(`runtime source changed after production deployment: ${unbound.join(", ")}`);
    }
    if (liveCommit !== value.deployedCommit) failures.push("live production commit does not match its receipt");
  }
  if (!value.screenshot?.path || !value.screenshot.sha256 || value.screenshot.visibleState?.length !== 3) failures.push("production screenshot receipt is incomplete");
  else {
    const screenshot = Bun.file(value.screenshot.path);
    if (!await screenshot.exists()) failures.push("production screenshot is missing");
    else {
      const hash = new Bun.CryptoHasher("sha256").update(await screenshot.arrayBuffer()).digest("hex");
      if (hash !== value.screenshot.sha256) failures.push("production screenshot hash does not match its receipt");
    }
  }
  if (/mcp\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text)) failures.push("production receipt contains an MCP credential");
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: production site and browser receipt verified at ${origin}`);
