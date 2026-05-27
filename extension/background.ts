/**
 * Background service worker.
 *
 * Lifecycle:
 *   1. user clicks the toolbar icon → popup → "open echo on this tab"
 *   2. background mints a signed session id from the configured Worker
 *   3. opens WebSocket to /agents/EchoAgent/<sessionId>?origin=...&token=...
 *   4. when the agent submits a plan that calls tab.execute(code), the
 *      worker dispatches `{type:"execute", callId, code, timeoutMs}` over
 *      the WS; we forward to the content script in the active tab
 *   5. content script evals the code in the page realm and returns
 *      `{ok, result|error}`; we relay it back over the WS
 *
 * Tab close → session ends (chrome.tabs.onRemoved triggers a close).
 */

const STORE = {
  workerBase: "workerBase",
} as const;

const DEFAULT_WORKER = "";
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;

const FORBIDDEN_PROTOCOLS = new Set([
  "chrome:", "chrome-extension:", "chrome-search:", "chrome-devtools:",
  "devtools:", "view-source:", "file:", "data:", "javascript:",
  "blob:", "about:", "edge:",
]);

type SessionState = {
  workerBase: string;
  origin: string;
  sessionId: string;
  signed: string;
  tabId: number;
};

let state: SessionState | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let onRemovedListener: ((closedTabId: number) => void) | null = null;

async function getWorkerBase(): Promise<string> {
  const data = await chrome.storage.local.get({ [STORE.workerBase]: DEFAULT_WORKER });
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

function scheduleReconnect(): void {
  if (!state || reconnectTimer) return;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt)) + Math.random() * 250;
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (state) connect(state.workerBase, state.signed, state.sessionId);
  }, delay);
}

function connect(workerBase: string, signed: string, sessionId: string): void {
  if (!state) return;
  // Agents SDK convention: camelCase class name → kebab-case path segment.
  // EchoAgent → echo-agent.
  const u = new URL(workerBase + `/agents/echo-agent/${sessionId}`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("origin", state.origin);
  u.searchParams.set("token", signed);

  const sock = new WebSocket(u.toString());
  ws = sock;

  sock.addEventListener("open", () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectAttempt = 0;
    setBadge("on");
  });

  sock.addEventListener("message", (e: MessageEvent) => {
    if (!state) return;
    let msg: { type?: string; callId?: string; code?: string; timeoutMs?: number };
    try { msg = JSON.parse(String(e.data)); } catch { return; }
    if (msg.type !== "execute" || !msg.callId) return;

    chrome.tabs.sendMessage(state.tabId, msg, (result) => {
      const err = chrome.runtime.lastError;
      if (err || !result) {
        sock.send(JSON.stringify({
          type: "result",
          callId: msg.callId,
          result: { ok: false, error: err?.message ? "tab_unreachable" : "tab_unreachable" },
        }));
        return;
      }
      sock.send(JSON.stringify({ type: "result", callId: msg.callId, result: result.result }));
    });
  });

  sock.addEventListener("close", () => {
    setBadge("off");
    if (state) scheduleReconnect();
  });

  sock.addEventListener("error", () => { try { sock.close(); } catch {} });
}

async function open(): Promise<{ ok: boolean; error?: string; sessionId?: string; signed?: string; origin?: string; mcpUrl?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.id) return { ok: false, error: "no_active_tab" };

  let parsed: URL;
  try { parsed = new URL(tab.url); } catch { return { ok: false, error: "bad_tab_url" }; }
  if (FORBIDDEN_PROTOCOLS.has(parsed.protocol)) return { ok: false, error: `forbidden_protocol:${parsed.protocol}` };
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, error: `unsupported_protocol:${parsed.protocol}` };

  const tabOrigin = parsed.origin;
  const workerBase = await getWorkerBase();
  if (!workerBase) return { ok: false, error: "worker_base_unset_open_options" };

  const minted = await mint(workerBase, tabOrigin).catch((e) => ({ error: String(e) }));
  if ("error" in minted) return { ok: false, error: minted.error };

  state = {
    workerBase,
    origin: tabOrigin,
    sessionId: minted.id,
    signed: minted.signed,
    tabId: tab.id,
  };
  reconnectAttempt = 0;
  connect(workerBase, minted.signed, minted.id);

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

function closeLocal(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { ws?.close(); } catch {}
  ws = null;
  state = null;
  reconnectAttempt = 0;
  if (onRemovedListener) {
    chrome.tabs.onRemoved.removeListener(onRemovedListener);
    onRemovedListener = null;
  }
  setBadge("off");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "open") { open().then(sendResponse); return true; }
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
