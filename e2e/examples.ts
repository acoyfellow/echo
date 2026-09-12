import { mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { examples } from "../examples/catalog";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const namesFor = (slug: string, tools: string[]) => {
  if (slug === "todo") return ["listTodos", "addTodo", "setCompleted", "deleteTodo"];
  if (slug === "notes") return ["readState", "setDraft", "uncertainMutation"];
  return tools.map((tool) => tool.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase()));
};

for (const example of examples) {
  const response = await fetch(`${base}/examples/${example.slug}/`);
  const html = await response.text();
  if (!response.ok || !html.includes(example.name) || !html.includes("/__svelte/")) throw new Error(`example_ssr_failed:${example.slug}`);
}

const cached = await readdir(join(homedir(), "Library", "Caches", "ms-playwright")).catch(() => []);
const candidates = cached.filter((name) => name.startsWith("chromium-")).sort().reverse().map((name) => join(homedir(), "Library", "Caches", "ms-playwright", name, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
let cachedBinary = "";
for (const candidate of candidates) if (await Bun.file(candidate).exists()) { cachedBinary = candidate; break; }
const binary = process.env.CHROME_PATH || cachedBinary || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "echo-examples-"));
const port = 11300 + Math.floor(Math.random() * 500);
const chrome = Bun.spawn([binary, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-default-apps", "about:blank"], { stdout: "ignore", stderr: "ignore" });

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: unknown };
let targetUrl = "";
for (let attempt = 0; attempt < 200; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    targetUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl ?? "";
    if (targetUrl) break;
  } catch {}
  await Bun.sleep(100);
}
if (!targetUrl) throw new Error("examples_chrome_target_missing");

const socket = new WebSocket(targetUrl);
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve(), { once: true });
  socket.addEventListener("error", () => reject(new Error("examples_cdp_failed")), { once: true });
});
let nextId = 0;
const pending = new Map<number, (message: CdpMessage) => void>();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as CdpMessage;
  if (message.id) pending.get(message.id)?.(message);
});
async function cdp(method: string, params: Record<string, unknown> = {}) {
  const id = ++nextId;
  const result = new Promise<CdpMessage>((resolve) => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params }));
  const message = await result;
  pending.delete(id);
  if (message.error) throw new Error(JSON.stringify(message.error));
  return message.result ?? {};
}
async function evaluate<Value>(expression: string): Promise<Value> {
  const response = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const result = response.result as { value?: Value; description?: string };
  if (!("value" in result)) throw new Error(result.description ?? "examples_evaluation_failed");
  return result.value as Value;
}
async function waitFor(expression: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if (await evaluate(expression)) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error(`examples_wait_failed:${expression}`);
}
async function call(endpoint: string, id: number, name: string, input: unknown, operationId?: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "echo_call_capability", arguments: { name, input, ...(operationId ? { operationId } : {}) } } }),
  });
  return response.json() as Promise<{ result?: { structuredContent?: { ok?: boolean; error?: string; result?: unknown } } }>;
}

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (let index = 0; index < examples.length; index += 1) {
    const example = examples[index];
    const previous = examples[(index - 1 + examples.length) % examples.length];
    const next = examples[(index + 1) % examples.length];
    const names = namesFor(example.slug, example.tools);
    console.log(`CHECK: ${example.slug}`);
    await cdp("Page.navigate", { url: `${base}/examples/${example.slug}/` });
    await waitFor("document.documentElement.dataset.hydrated === 'true' && !!document.querySelector('#connect')");
    const layout = await evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth
      && document.querySelector('nav[aria-label="Example navigation"] a:first-child').getAttribute('href') === '/examples/${previous.slug}/'
      && document.querySelector('nav[aria-label="Example navigation"] a:nth-child(2)').getAttribute('href') === '/examples/'
      && document.querySelector('nav[aria-label="Example navigation"] a:last-child').getAttribute('href') === '/examples/${next.slug}/'`);
    if (!layout) throw new Error(`example_layout_failed:${example.slug}`);
    await evaluate("document.querySelector('#connect').click(); true");
    await waitFor("!!document.querySelector('#session')?.textContent?.startsWith('http')");
    const endpoint = await evaluate<string>("document.querySelector('#session').textContent");
    const invoked = await call(endpoint, index * 2 + 1, names[0], { text: `Played ${example.name}` }, crypto.randomUUID());
    if (!invoked.result?.structuredContent?.ok) throw new Error(`example_call_failed:${example.slug}:${invoked.result?.structuredContent?.error}`);
    await waitFor(`document.querySelector('#activity').textContent.includes(${JSON.stringify(names[0])})`);
    await evaluate("document.querySelector('#stop').click(); true");
    const stopped = await call(endpoint, index * 2 + 2, names[0], {}, crypto.randomUUID());
    if (stopped.result?.structuredContent?.error !== "session_closed") throw new Error(`example_stop_failed:${example.slug}`);
  }
  console.log("PASS: all 16 examples SSR, hydrate, expose live Echo tools, stop, wrap footer navigation, and fit mobile");
} finally {
  socket.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}
