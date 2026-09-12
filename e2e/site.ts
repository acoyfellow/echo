import { mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
for (const [path, text] of [["/", "Give your agent a live tab."], ["/demo/", "Codemode target"]] as const) {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();
  if (!response.ok || !html.includes(text) || !html.includes("/__svelte/")) throw new Error(`ssr_failed:${path}`);
}
for (const path of ["/examples/", "/examples/todo/", "/spike/owner-cut/"]) {
  const response = await fetch(`${base}${path}`);
  if (response.status !== 404) throw new Error(`removed_route_alive:${path}:${response.status}`);
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
    try { if (await evaluate(expression)) return; } catch {}
    await Bun.sleep(100);
  }
  throw new Error(`site_wait_failed:${expression}`);
}

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.documentElement.dataset.hydrated === 'true'");
  const desktop = await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth && document.querySelector('#hero-code').scrollWidth <= document.querySelector('#hero-code').clientWidth");
  if (!desktop) throw new Error("home_desktop_overflow");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth");
  if (!mobile) throw new Error("home_mobile_overflow");
  await cdp("Page.navigate", { url: `${base}/demo/` });
  await waitFor("document.documentElement.dataset.hydrated === 'true' && document.querySelector('#draft')?.value === 'Initial draft'");
  await evaluate("document.querySelector('#draft').value='Added by the browser referee';document.querySelector('#draft').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit();true");
  await waitFor("document.body.textContent.includes('Added by the browser referee')");
  const demoMobile = await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll('#todos li').length === 4");
  if (!demoMobile) throw new Error("demo_mobile_failed");
  console.log("PASS: one Codemode homepage and one Todo target SSR, hydrate, work, fit mobile, and removed routes return 404");
} finally {
  socket.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}
