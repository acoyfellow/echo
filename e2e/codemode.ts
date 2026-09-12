import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const playwrightCache = join(homedir(), "Library", "Caches", "ms-playwright");
const cachedVersions = await readdir(playwrightCache).catch(() => []);
const testingCandidates = cachedVersions
  .filter((name) => name.startsWith("chromium-"))
  .sort()
  .reverse()
  .map((name) => join(playwrightCache, name, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
let testingBinary = "";
for (const candidate of testingCandidates) {
  if (await Bun.file(candidate).exists()) {
    testingBinary = candidate;
    break;
  }
}
const binary = process.env.CHROME_PATH || testingBinary || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const extension = new URL("../extension", import.meta.url).pathname;
const defaultOutput = new URL("../receipts/codemode/chrome-local", import.meta.url).pathname;
const output = process.env.ECHO_CODEMODE_OUTPUT || defaultOutput;
const manifest = await Bun.file(new URL("../extension/manifest.json", import.meta.url)).json() as { key: string };
const publicKey = Uint8Array.from(atob(manifest.key), (value) => value.charCodeAt(0));
const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKey)).slice(0, 16);
const extensionId = [...digest].map((value) => `${String.fromCharCode(97 + (value >> 4))}${String.fromCharCode(97 + (value & 15))}`).join("");
const port = 9800 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), "echo-codemode-"));
await mkdir(output, { recursive: true });

let worker: ReturnType<typeof Bun.spawn> | null = null;
let health = await fetch(`${base}/health`).catch(() => null);
if (!health?.ok) {
  worker = Bun.spawn(["bun", "run", "dev"], { cwd: new URL("..", import.meta.url).pathname, stdout: "ignore", stderr: "ignore" });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    await Bun.sleep(100);
    health = await fetch(`${base}/health`).catch(() => null);
    if (health?.ok) break;
  }
}
if (!health?.ok) throw new Error("local_worker_start_failed");

const chrome = Bun.spawn([
  binary,
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--disable-extensions-except=${extension}`,
  `--load-extension=${extension}`,
  "--no-first-run",
  "--disable-default-apps",
  `${base}/demo/?codemode=approved`,
], { stdout: "ignore", stderr: "ignore" });

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: unknown };
type TargetInfo = { type: string; url: string; webSocketDebuggerUrl: string; id: string };

async function targets(): Promise<TargetInfo[]> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const values = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as TargetInfo[];
      if (values.some((target) => target.type === "page" && target.url.startsWith(base))) return values;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("chrome_targets_timeout");
}

class Cdp {
  readonly socket: WebSocket;
  #nextId = 0;
  #pending = new Map<number, (message: CdpMessage) => void>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id) this.#pending.get(message.id)?.(message);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("cdp_connect_failed")), { once: true });
    });
    return new Cdp(socket);
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.#nextId;
    const pending = new Promise<CdpMessage>((resolve) => this.#pending.set(id, resolve));
    this.socket.send(JSON.stringify({ id, method, params }));
    const message = await pending;
    this.#pending.delete(id);
    if (message.error) throw new Error(JSON.stringify(message.error));
    return message.result ?? {};
  }

  async evaluate<Value>(expression: string): Promise<Value> {
    const response = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    const result = response.result as { value?: Value; description?: string };
    if (!("value" in result)) throw new Error(result.description ?? "evaluation_failed");
    return result.value as Value;
  }
}

async function targetFor(prefix: string): Promise<TargetInfo> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const target = (await targets()).find((candidate) => candidate.type === "page" && candidate.url.startsWith(prefix));
    if (target) return target;
    await Bun.sleep(100);
  }
  throw new Error(`target_missing:${prefix}`);
}

async function waitForReady(page: Cdp): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await page.evaluate("document.readyState") === "complete") return;
    await Bun.sleep(100);
  }
  throw new Error("page_ready_timeout");
}

async function extensionPopup(browser: Cdp, extensionId: string): Promise<Cdp> {
  const url = `chrome-extension://${extensionId}/popup.html?referee=1`;
  await browser.call("Target.createTarget", { url });
  return Cdp.connect((await targetFor(url)).webSocketDebuggerUrl);
}

async function popupMessage<Value>(popup: Cdp, message: Record<string, unknown>): Promise<Value> {
  return popup.evaluate<Value>(`chrome.runtime.sendMessage(${JSON.stringify(message)})`);
}

async function mcpCall(endpoint: string, id: number, code: string, operationId: string): Promise<{ ok?: boolean; error?: string; result?: unknown }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: "page_evaluate", arguments: { code, operationId } },
    }),
  });
  const body = await response.json() as { result?: { structuredContent?: { ok?: boolean; error?: string; result?: unknown } } };
  return body.result?.structuredContent ?? {};
}

try {
  const extensionBuild = Bun.spawnSync(["bun", "run", "build:extension"], { env: { ...process.env, ECHO_WORKER_BASE: base }, stdout: "ignore", stderr: "inherit" });
  if (extensionBuild.exitCode !== 0) throw new Error("extension_build_failed");
  const initialTargets = await targets();
  const approvedTarget = initialTargets.find((target) => target.type === "page" && target.url.startsWith(`${base}/demo/`));
  if (!approvedTarget) throw new Error("approved_target_missing");
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json()) as { webSocketDebuggerUrl: string; Browser?: string; "User-Agent"?: string };
  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const approvedPage = await Cdp.connect(approvedTarget.webSocketDebuggerUrl);
  await approvedPage.call("Page.enable");
  await approvedPage.call("Runtime.enable");
  await waitForReady(approvedPage);
  await approvedPage.evaluate("window.__echoPrivateState={customer:'private-state'};true");
  const secondUrl = `${base}/demo/?codemode=other-tab`;
  await browser.call("Target.createTarget", { url: secondUrl });
  const otherPage = await Cdp.connect((await targetFor(secondUrl)).webSocketDebuggerUrl);
  await otherPage.call("Runtime.enable");
  await waitForReady(otherPage);
  const popup = await extensionPopup(browser, extensionId);
  await popup.call("Page.enable");
  await popup.call("Runtime.enable");
  await waitForReady(popup);

  const beforeApproval = await popupMessage<{ active?: boolean }>(popup, { type: "status" });
  await popup.evaluate(`(()=>{
    const select=document.querySelector('#tabs');
    const option=[...select.options].find((candidate)=>candidate.dataset.url.includes('codemode=approved'));
    if(!option)throw new Error('approved_tab_option_missing');
    select.value=option.value;
    document.querySelector('#approve').click();
    return true;
  })()`);
  let approval: { active?: boolean; mcpUrl?: string; origin?: string } = {};
  for (let attempt = 0; attempt < 100; attempt += 1) {
    approval = await popupMessage(popup, { type: "status" });
    if (approval.active) break;
    await Bun.sleep(100);
  }
  if (!approval.active || !approval.mcpUrl) throw new Error("codemode_approval_failed");
  await approvedPage.evaluate("window.__echoPrivateState={customer:'private-state'};true");

  const execution = await mcpCall(
    approval.mcpUrl,
    1,
    `(()=>{const secret=window.__echoPrivateState.customer;localStorage.setItem('echo-codemode-proof','stored');document.querySelector('#draft').value='Changed by Codemode';document.body.dataset.echoCodemode='executed';return {secret,storage:localStorage.getItem('echo-codemode-proof'),draft:document.querySelector('#draft').value}})()`,
    "codemode-execute-1",
  );
  const approvedObservation = await approvedPage.evaluate<{ draft: string; marker?: string }>(`({draft:document.querySelector('#draft').value,marker:document.body.dataset.echoCodemode})`);
  const otherObservation = await otherPage.evaluate<{ draft: string; marker?: string }>(`({draft:document.querySelector('#draft').value,marker:document.body.dataset.echoCodemode})`);
  const executedScreenshot = await approvedPage.call("Page.captureScreenshot", { format: "png" }) as { data: string };
  await writeFile(join(output, "executed.png"), Buffer.from(executedScreenshot.data, "base64"));
  const activeStatus = await popupMessage<{ active?: boolean; lastReceipt?: { codeHash?: string; status?: string } }>(popup, { type: "status" });
  const uncertain = await mcpCall(
    approval.mcpUrl,
    5,
    `(()=>{document.body.dataset.echoUncertain='effect-visible';throw new Error('after-effect')})()`,
    "codemode-uncertain-1",
  );
  const uncertainObservation = await approvedPage.evaluate<string | undefined>("document.body.dataset.echoUncertain");
  const uncertainStatus = await popupMessage<{ lastReceipt?: { status?: string } }>(popup, { type: "status" });
  await popup.call("Page.reload");
  await waitForReady(popup);
  const popupScreenshot = await popup.call("Page.captureScreenshot", { format: "png" }) as { data: string };
  await writeFile(join(output, "approval.png"), Buffer.from(popupScreenshot.data, "base64"));
  await popupMessage(popup, { type: "stop" });
  const afterStop = await mcpCall(approval.mcpUrl, 2, "document.title", "codemode-after-stop");
  const stoppedStatus = await popupMessage<{ active?: boolean; status?: { reason?: string } }>(popup, { type: "status" });

  const restartApproval = await popup.evaluate<{ ok?: boolean; mcpUrl?: string }>(`(async()=>{
    const tabs=await chrome.tabs.query({url:${JSON.stringify(`${base}/demo/*`)}});
    const tab=tabs.find((candidate)=>candidate.url.includes('codemode=approved'));
    return chrome.runtime.sendMessage({type:'approve',tabId:tab.id});
  })()`);
  if (!restartApproval.ok || !restartApproval.mcpUrl) throw new Error("restart_session_failed");
  const extensionWorker = (await targets()).find((target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${extensionId}/`));
  if (!extensionWorker) throw new Error("extension_worker_missing");
  await browser.call("Target.closeTarget", { targetId: extensionWorker.id });
  await Bun.sleep(500);
  const restartStatus = await popupMessage<{ active?: boolean; status?: { reason?: string } }>(popup, { type: "status" });
  const afterRestart = await mcpCall(restartApproval.mcpUrl, 6, "document.title", "codemode-after-restart");

  const secondApproval = await popup.evaluate<{ ok?: boolean; mcpUrl?: string }>(`(async()=>{
    const tabs=await chrome.tabs.query({url:${JSON.stringify(`${base}/demo/*`)}});
    const tab=tabs.find((candidate)=>candidate.url.includes('codemode=approved'));
    return chrome.runtime.sendMessage({type:'approve',tabId:tab.id});
  })()`);
  if (!secondApproval.ok || !secondApproval.mcpUrl) throw new Error("navigation_session_failed");
  await approvedPage.call("Page.navigate", { url: base.replace("127.0.0.1", "localhost") + "/demo/?codemode=navigated" });
  await Bun.sleep(750);
  const navigationStatus = await popupMessage<{ active?: boolean; status?: { reason?: string } }>(popup, { type: "status" });
  const afterNavigation = await mcpCall(secondApproval.mcpUrl, 3, "document.title", "codemode-after-navigation");

  await approvedPage.call("Page.navigate", { url: `${base}/demo/?codemode=approved` });
  await Bun.sleep(500);
  const expiryApproval = await popup.evaluate<{ ok?: boolean; mcpUrl?: string }>(`(async()=>{
    const tabs=await chrome.tabs.query({url:${JSON.stringify(`${base}/demo/*`)}});
    const tab=tabs.find((candidate)=>candidate.url.includes('codemode=approved'));
    return chrome.runtime.sendMessage({type:'approve',tabId:tab.id,durationMs:300});
  })()`);
  if (!expiryApproval.ok || !expiryApproval.mcpUrl) throw new Error("expiry_session_failed");
  await Bun.sleep(1000);
  const expiryStatus = await popupMessage<{ active?: boolean; status?: { reason?: string } }>(popup, { type: "status" });
  const afterExpiry = await mcpCall(expiryApproval.mcpUrl, 4, "document.title", "codemode-after-expiry");

  const executionResult = execution.result as { secret?: string; storage?: string; draft?: string } | undefined;
  const passed = !beforeApproval.active
    && approval.origin === new URL(base).origin
    && execution.ok === true
    && executionResult?.secret === "private-state"
    && executionResult.storage === "stored"
    && approvedObservation.draft === "Changed by Codemode"
    && approvedObservation.marker === "executed"
    && otherObservation.draft === "Initial draft"
    && !otherObservation.marker
    && activeStatus.active === true
    && activeStatus.lastReceipt?.status === "completed"
    && activeStatus.lastReceipt.codeHash?.length === 64
    && uncertain.error === "outcome_unknown"
    && uncertainObservation === "effect-visible"
    && uncertainStatus.lastReceipt?.status === "outcome_unknown"
    && afterStop.error === "session_closed"
    && stoppedStatus.active === false
    && stoppedStatus.status?.reason === "user_stopped"
    && afterRestart.error === "session_closed"
    && restartStatus.active === false
    && restartStatus.status?.reason === "worker_restarted"
    && afterNavigation.error === "session_closed"
    && navigationStatus.active === false
    && navigationStatus.status?.reason === "origin_changed"
    && afterExpiry.error === "session_closed"
    && expiryStatus.active === false
    && expiryStatus.status?.reason === "expired";

  const screenshot = await approvedPage.call("Page.captureScreenshot", { format: "png" }) as { data: string };
  await writeFile(join(output, "final.png"), Buffer.from(screenshot.data, "base64"));
  const sourceCommit = (await Bun.$`git rev-parse HEAD`.text()).trim();
  const screenshots = [];
  for (const file of ["approval.png", "executed.png", "final.png"]) {
    const bytes = await Bun.file(join(output, file)).arrayBuffer();
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    screenshots.push({ file, sha256 });
  }
  const receipt = {
    schemaVersion: 1,
    sourceCommit,
    status: passed ? "passed" : "failed",
    claim: "Echo Codemode grants full JavaScript authority to one explicitly approved Chrome tab and revokes it from trusted extension UI.",
    environment: { browser: version.Browser, userAgent: version["User-Agent"], origin: base },
    authority: { mode: "page.javascript.full", extensionId, durationMinutes: 10, exactTab: true, exactOrigin: true, trustedStop: "Chrome extension service worker" },
    observations: {
      beforeApproval: { active: beforeApproval.active ?? false },
      execution: { ok: execution.ok, readPrivateState: executionResult?.secret === "private-state", readStorage: executionResult?.storage === "stored" },
      approvedTab: approvedObservation,
      otherTab: otherObservation,
      receipt: { status: activeStatus.lastReceipt?.status, codeHashLength: activeStatus.lastReceipt?.codeHash?.length },
      uncertainOutcome: { error: uncertain.error, effectVisible: uncertainObservation === "effect-visible", receiptStatus: uncertainStatus.lastReceipt?.status },
      stop: { error: afterStop.error, reason: stoppedStatus.status?.reason },
      workerRestart: { error: afterRestart.error, reason: restartStatus.status?.reason },
      navigation: { error: afterNavigation.error, reason: navigationStatus.status?.reason },
      expiry: { error: afterExpiry.error, reason: expiryStatus.status?.reason },
    },
    screenshots,
    independentEvidence: ["Chrome DevTools Protocol referee clicked the approval UI and observed both approved and unapproved tabs", "approval.png", "executed.png", "final.png"],
    redactions: ["MCP session credential", "page token", "generated JavaScript source", "execution result values"],
    limitations: ["The Chrome debugger permission shows Chrome's debugging disclosure while attached.", "Stopping detaches future authority but does not undo page changes already made.", "The Worker runs locally on loopback."],
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!passed) throw new Error("codemode_e2e_failed");
  console.log(`PASS: ${version.Browser} one-tab Codemode execution, Stop, navigation revocation, and expiry`);
  browser.socket.close();
  approvedPage.socket.close();
  otherPage.socket.close();
  popup.socket.close();
} finally {
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
  if (worker) {
    worker.kill();
    await worker.exited;
  }
}
