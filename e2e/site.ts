import { mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const routes = [
  ["/", "Your app already knows what to do."],
  ["/examples/", "Little apps. Real agent tools."],
  ["/examples/todo/", "Tiny todo"],
  ["/examples/notes/", "Quarterly notes"],
] as const;
for (const [path, text] of routes) {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();
  if (!response.ok || !html.includes(text) || !html.includes("/__svelte/")) throw new Error(`ssr_failed:${path}`);
}

const cached = await readdir(join(homedir(), "Library", "Caches", "ms-playwright")).catch(() => []);
const candidates = cached.filter((name) => name.startsWith("chromium-")).sort().reverse().map((name) => join(homedir(), "Library", "Caches", "ms-playwright", name, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
let cachedBinary = "";
for (const candidate of candidates) if (await Bun.file(candidate).exists()) { cachedBinary = candidate; break; }
const binary = process.env.CHROME_PATH || cachedBinary || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "echo-site-"));
const port = 10300 + Math.floor(Math.random() * 500);
const chrome = Bun.spawn([binary, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-default-apps", `${base}/`], { stdout: "ignore", stderr: "ignore" });

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: unknown };
let targetUrl = "";
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
    targetUrl = targets.find((target) => target.type === "page" && target.url === `${base}/`)?.webSocketDebuggerUrl ?? "";
    if (targetUrl) break;
  } catch {}
  await Bun.sleep(100);
}
if (!targetUrl) throw new Error("site_chrome_target_missing");

const socket = new WebSocket(targetUrl);
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve(), { once: true });
  socket.addEventListener("error", () => reject(new Error("site_cdp_failed")), { once: true });
});
let nextId = 0;
const pending = new Map<number, (message: CdpMessage) => void>();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as CdpMessage;
  if (message.id) pending.get(message.id)?.(message);
});
async function cdp(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
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
  if (!("value" in result)) throw new Error(result.description ?? "site_evaluation_failed");
  return result.value as Value;
}
async function waitFor(expression: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(expression)) return;
    await Bun.sleep(100);
  }
  throw new Error(`site_wait_failed:${expression}`);
}
async function tool(endpoint: string, id: number, name: string, input: unknown, operationId?: string) {
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
  await waitFor("document.documentElement.dataset.hydrated === 'true' && !!document.querySelector('#open-line')");
  await waitFor("document.querySelector('iframe')?.contentDocument?.documentElement.dataset.hydrated === 'true' && !!document.querySelector('iframe')?.contentDocument?.querySelector('#connect')");
  await evaluate("document.querySelector('#open-line').click(); true");
  await waitFor("frames[0].document.querySelector('#status')?.textContent === 'Agent connected'");
  const endpoint = await evaluate<string>("frames[0].document.querySelector('#session').textContent");
  const listed = await tool(endpoint, 1, "listTodos", {});
  if (!listed.result?.structuredContent?.ok) throw new Error("site_echo_list_failed");
  const text = `Hydrated through Echo ${Date.now()}`;
  const added = await tool(endpoint, 2, "addTodo", { text }, crypto.randomUUID());
  if (!added.result?.structuredContent?.ok) throw new Error("site_echo_add_failed");
  await waitFor(`frames[0].document.body.textContent.includes(${JSON.stringify(text)}) && document.querySelector('#open-line').textContent.includes('Agent line open')`);
  await waitFor("document.body.textContent.includes('ADDTODO · FINISHED · THIS CAME THROUGH ECHO')");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const responsive = await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth && frames[0].document.documentElement.scrollWidth <= frames[0].innerWidth");
  if (!responsive) throw new Error("site_mobile_overflow");
  await evaluate("frames[0].document.querySelector('#stop').click(); true");
  await waitFor("document.body.textContent.includes('SESSION CLOSED · the wire is cut')");
  const afterStop = await tool(endpoint, 3, "listTodos", {});
  if (afterStop.result?.structuredContent?.error !== "session_closed") throw new Error("site_stop_failed");
  console.log("PASS: Svelte SSR, hydration, responsive layout, real Echo MCP mutation, live activity wire, and Stop");
} finally {
  socket.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}
