/**
 * Background service worker.
 *
 * Uses `AgentClient` from the agents SDK. AgentClient is built on PartySocket
 * which has reconnect, heartbeat, and MV3-service-worker-lifecycle handling
 * already solved. Raw `new WebSocket()` in MV3 dies silently — don't.
 *
 * Lifecycle:
 *   1. user clicks toolbar icon → popup → "open echo on this tab"
 *   2. background mints a signed session id via POST /sessions
 *   3. AgentClient connects to /agents/echo-agent/<sessionId>?origin=...&token=...
 *   4. supervisor sends {type:"execute",callId,code,timeoutMs}; we forward
 *      to the content script in the active tab
 *   5. content script evals in the page realm and returns {ok, result|error};
 *      we relay over the AgentClient
 */

import { AgentClient } from "agents/client";

const STORE = {
  workerBase: "workerBase",
} as const;

const HEARTBEAT_ALARM = "echo-keepalive";
const HEARTBEAT_PERIOD_MIN = 0.4; // chrome alarms minimum is 0.5; we use 0.4 to be safe

type SessionState = {
  workerBase: string;
  origin: string;
  sessionId: string;
  signed: string;
  tabId: number;
};

let state: SessionState | null = null;
let client: AgentClient | null = null;
let onRemovedListener: ((closedTabId: number) => void) | null = null;

async function getWorkerBase(): Promise<string> {
  const data = await chrome.storage.local.get({ [STORE.workerBase]: "" });
  return String(data[STORE.workerBase] || "").replace(/\/$/, "");
}

async function mint(workerBase: string, origin: string): Promise<{ id: string; signed: string }> {
  const r = await fetch(workerBase + "/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin }),
  });
  if (!r.ok) throw new Error("mint_failed: " + r.status);
  return (await r.json()) as { id: string; signed: string };
}

function setBadge(s: "on" | "off"): void {
  chrome.action.setBadgeText({ text: s === "on" ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: s === "on" ? "#16a34a" : "#888" });
}

function startKeepalive(): void {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MIN });
}
function stopKeepalive(): void {
  chrome.alarms.clear(HEARTBEAT_ALARM);
}

function connect(workerBase: string, signed: string, sessionId: string, origin: string): void {
  if (!state) return;

  const u = new URL(workerBase);
  const host = u.host;

  console.log("[echo] connect:", { host, sessionId, origin });

  try {
    client = new AgentClient({
      agent: "EchoAgent",
      name: sessionId,
      host,
      query: { origin, token: signed },
    });
    console.log("[echo] AgentClient created", { url: (client as { _url?: unknown })._url });
  } catch (e) {
    console.error("[echo] AgentClient constructor threw", e);
    return;
  }

  client.addEventListener("open", () => {
    console.log("[echo] WS open");
    setBadge("on");
    startKeepalive();
  });

  client.addEventListener("message", async (e: MessageEvent) => {
    if (!state) return;
    let msg: { type?: string; callId?: string; code?: string; timeoutMs?: number };
    try { msg = JSON.parse(String(e.data)); } catch { return; }
    if (msg.type !== "execute" || !msg.callId || typeof msg.code !== "string") return;

    // Inject into the page's MAIN world. Content-script-isolated-world has a
    // restrictive CSP (no eval / no new Function), but the page's MAIN world
    // runs under the page's own CSP. For sites without an `unsafe-eval` rule
    // (most of them), `new AsyncFunction` works there.
    const out = await runInTab(state.tabId, msg.code, msg.timeoutMs ?? 30_000);
    try {
      client?.send(JSON.stringify({ type: "result", callId: msg.callId, result: out }));
    } catch { /* socket may have closed */ }
  });

  client.addEventListener("close", (e: Event) => {
    console.log("[echo] WS close", (e as CloseEvent).code, (e as CloseEvent).reason);
    setBadge("off");
  });

  client.addEventListener("error", (e: Event) => {
    console.error("[echo] WS error", (e as ErrorEvent).message);
  });
}

async function open(opts: { tabId?: number } = {}): Promise<{ ok: boolean; error?: string; sessionId?: string; signed?: string; origin?: string; mcpUrl?: string }> {
  // Pick the tab to attach to:
  //   1. honour an explicit tabId from the popup (it knows what the user was looking at)
  //   2. otherwise prefer the active tab in the last-focused window
  //   3. otherwise any active http(s) tab anywhere
  // We only require http(s) because that's where content scripts can run.
  // Chrome itself blocks injection into chrome://, chrome-extension://, etc.
  let tab: chrome.tabs.Tab | undefined;
  if (opts.tabId !== undefined) {
    try { tab = await chrome.tabs.get(opts.tabId); } catch { tab = undefined; }
  }
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    const focused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = focused.find((t) => t.url && /^https?:/.test(t.url));
  }
  if (!tab || !tab.url || !tab.id) {
    const any = await chrome.tabs.query({});
    tab = any.find((t) => t.active && t.url && /^https?:/.test(t.url));
  }
  if (!tab?.url || !tab.id) return { ok: false, error: "no_active_http_tab" };

  let parsed: URL;
  try { parsed = new URL(tab.url); } catch { return { ok: false, error: "bad_tab_url" }; }

  const tabOrigin = parsed.origin;
  const workerBase = await getWorkerBase();
  if (!workerBase) return { ok: false, error: "worker_base_unset_open_options" };

  const minted = await mint(workerBase, tabOrigin).catch((e) => ({ error: String(e) } as { error: string }));
  if ("error" in minted) return { ok: false, error: minted.error };

  state = {
    workerBase,
    origin: tabOrigin,
    sessionId: minted.id,
    signed: minted.signed,
    tabId: tab.id,
  };

  connect(workerBase, minted.signed, minted.id, tabOrigin);

  if (onRemovedListener) chrome.tabs.onRemoved.removeListener(onRemovedListener);
  onRemovedListener = (closedTabId: number) => {
    if (state?.tabId === closedTabId) closeLocal();
  };
  chrome.tabs.onRemoved.addListener(onRemovedListener);

  return {
    ok: true,
    sessionId: minted.id,
    signed: minted.signed,
    origin: tabOrigin,
    mcpUrl: workerBase + "/mcp?id=" + encodeURIComponent(minted.signed),
  };
}

// Runs in the target tab's MAIN world. Defined at top-level so chrome.scripting
// can serialize it (closures don't survive structured cloning into MAIN world).
function __echoMainWorldExecute(code: string, timeoutMs: number): Promise<{ ok: boolean; result?: unknown; error?: string; logs?: string[] }> {
  return new Promise(async (resolve) => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<unknown>;
    const logs: string[] = [];
    const log = (line: unknown) => {
      const s = typeof line === "string" ? line : JSON.stringify(line);
      logs.push(s);
      if (logs.length > 1000) logs.shift();
    };
    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
      fn = new AsyncFunction("__echoLog", "log", code);
    } catch (e) {
      resolve({ ok: false, error: "compile_failed: " + String(e), logs: [] });
      return;
    }
    try {
      const run = fn(log, log);
      const result = await Promise.race([
        run,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout_after_" + timeoutMs + "ms")), timeoutMs),
        ),
      ]);
      resolve({ ok: true, result, logs });
    } catch (e) {
      resolve({ ok: false, error: String(e), logs });
    }
  });
}

async function runInTab(tabId: number, code: string, timeoutMs: number): Promise<unknown> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: __echoMainWorldExecute,
      args: [code, timeoutMs],
    });
    return results[0]?.result ?? { ok: false, error: "no_result" };
  } catch (e) {
    return { ok: false, error: "executeScript_failed: " + String(e) };
  }
}

function closeLocal(): void {
  try { client?.close(); } catch {}
  client = null;
  state = null;
  stopKeepalive();
  if (onRemovedListener) {
    chrome.tabs.onRemoved.removeListener(onRemovedListener);
    onRemovedListener = null;
  }
  setBadge("off");
}

// Keep-alive: the alarm fires every ~24s, the handler reads chrome.storage
// which counts as activity. PartySocket already pings, but Chrome can
// still suspend the SW if no chrome.* API is touched.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    chrome.storage.local.get({}, () => { /* keep-alive ping */ });
  }
});

// External messages from echo's own docs site (origins listed in
// manifest.externally_connectable.matches). The docs page can ask the
// extension to attach to the current tab without the user opening the popup.
chrome.runtime.onMessageExternal?.addListener((msg, sender, sendResponse) => {
  // Explicit tabId in the message wins (caller knows which tab to target).
  // Fall back to sender.tab.id (caller wants to attach to itself).
  const tabId = typeof msg?.tabId === "number" ? msg.tabId : sender.tab?.id;
  if (msg?.type === "open") { open({ tabId }).then(sendResponse); return true; }
  if (msg?.type === "status") {
    sendResponse({
      open: !!state,
      sessionId: state?.sessionId,
      signed: state?.signed,
      origin: state?.origin,
      mcpUrl: state ? state.workerBase + "/mcp?id=" + encodeURIComponent(state.signed) : undefined,
    });
    return false;
  }
  if (msg?.type === "close") { closeLocal(); sendResponse({ ok: true }); return false; }
  sendResponse({ ok: false, error: "unknown_external" });
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "wstest") {
    // Hand-rolled WS test — confirm a raw WS from this SW reaches /agents/.
    const url = String(msg.url || "");
    const sock = new WebSocket(url);
    sock.addEventListener("open", () => sendResponse({ result: "open" }));
    sock.addEventListener("error", (e) => sendResponse({ result: "error", message: (e as ErrorEvent).message ?? "" }));
    sock.addEventListener("close", (e) => sendResponse({ result: "close", code: (e as CloseEvent).code }));
    setTimeout(() => sendResponse({ result: "timeout" }), 4000);
    return true;
  }
  if (msg?.type === "open") { open({ tabId: typeof msg.tabId === "number" ? msg.tabId : undefined }).then(sendResponse); return true; }
  if (msg?.type === "close") { closeLocal(); sendResponse({ ok: true }); return false; }
  if (msg?.type === "status") {
    sendResponse({
      open: !!state,
      sessionId: state?.sessionId ?? null,
      signed: state?.signed ?? null,
      origin: state?.origin ?? null,
      mcpUrl: state ? state.workerBase + "/mcp?id=" + encodeURIComponent(state.signed) : null,
    });
    return false;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => setBadge("off"));
