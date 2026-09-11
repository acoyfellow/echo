export {};

type SessionState = {
  tabId: number;
  origin: string;
  workerBase: string;
  sessionId: string;
  mcpUrl: string;
  pageToken: string;
  expiresAt: number;
};

type SocketMessage = {
  type?: string;
  callId?: string;
  name?: string;
  input?: unknown;
};

const workerBase = "http://127.0.0.1:8870";
const debuggerVersion = "1.3";
const expiryAlarm = "echo-codemode-expiry";
let state: SessionState | null = null;
let socket: WebSocket | null = null;
let stopping = false;

function validPage(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

async function codeHash(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function stopSession(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const previous = state;
  state = null;
  const previousSocket = socket;
  socket = null;
  previousSocket?.close();
  await chrome.alarms.clear(expiryAlarm);
  if (previous) await chrome.debugger.detach({ tabId: previous.tabId }).catch(() => undefined);
  await chrome.storage.session.set({ echoStatus: { active: false, reason } });
  await chrome.action.setBadgeText({ text: "" });
  stopping = false;
}

async function currentTabMatches(): Promise<boolean> {
  if (!state) return false;
  const tab = await chrome.tabs.get(state.tabId).catch(() => null);
  return validPage(tab?.url)?.origin === state.origin;
}

async function evaluatePage(code: string): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!state || !await currentTabMatches()) {
    await stopSession("origin_changed");
    return { ok: false, error: "origin_changed" };
  }
  const startedAt = Date.now();
  const hash = await codeHash(code);
  try {
    const response = await chrome.debugger.sendCommand({ tabId: state.tabId }, "Runtime.evaluate", {
      expression: code,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    }) as { result?: { value?: unknown; unserializableValue?: string }; exceptionDetails?: unknown };
    if (response.exceptionDetails) throw new Error("page_execution_failed");
    const result = response.result?.value ?? response.result?.unserializableValue ?? null;
    await chrome.storage.session.set({
      echoLastReceipt: { origin: state.origin, codeHash: hash, startedAt, finishedAt: Date.now(), status: "completed" },
    });
    return { ok: true, result };
  } catch {
    await chrome.storage.session.set({
      echoLastReceipt: { origin: state?.origin ?? "revoked", codeHash: hash, startedAt, finishedAt: Date.now(), status: "failed" },
    });
    return { ok: false, error: "page_execution_failed" };
  }
}

function connectSocket(session: SessionState): Promise<void> {
  const url = new URL(`/agents/echo-agent/${session.sessionId}`, session.workerBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("origin", session.origin);
  url.searchParams.set("token", session.pageToken);
  url.searchParams.set("appId", "echo-codemode");
  url.searchParams.set("transport", "page");
  const connecting = new WebSocket(url.toString());
  socket = connecting;
  connecting.addEventListener("message", (event) => {
    void handleSocketMessage(connecting, event);
  });
  connecting.addEventListener("close", () => {
    if (socket === connecting && state) void stopSession("connection_closed");
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("connection_timeout")), 10_000);
    connecting.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    connecting.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("connection_failed"));
    }, { once: true });
  });
}

async function handleSocketMessage(connection: WebSocket, event: MessageEvent): Promise<void> {
  let message: SocketMessage;
  try {
    message = JSON.parse(String(event.data)) as SocketMessage;
  } catch {
    return;
  }
  if (!message.callId) return;
  if (message.type === "capability_list") {
    connection.send(JSON.stringify({
      type: "result",
      callId: message.callId,
      result: {
        ok: true,
        result: {
          appId: "echo-codemode",
          origin: state?.origin,
          capabilities: [{
            name: "page.evaluate",
            description: "Run arbitrary JavaScript with the approved page's full authority",
            effect: "mutation",
            inputSchema: {
              type: "object",
              properties: { code: { type: "string", maxLength: 65536 } },
              required: ["code"],
              additionalProperties: false,
            },
          }],
        },
      },
    }));
    return;
  }
  const input = message.input as { code?: unknown } | null;
  if (message.type !== "capability_call" || message.name !== "page.evaluate" || typeof input?.code !== "string" || input.code.length > 65_536) {
    connection.send(JSON.stringify({ type: "result", callId: message.callId, result: { ok: false, error: "codemode_input_invalid" } }));
    return;
  }
  const result = await evaluatePage(input.code);
  if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: "result", callId: message.callId, result }));
}

async function approve(tabId?: number, durationMs = 10 * 60_000): Promise<{ ok: boolean; error?: string; mcpUrl?: string; origin?: string; expiresAt?: number }> {
  if (state) return { ok: false, error: "session_active" };
  const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const page = validPage(tab?.url);
  if (!tab?.id || !page) return { ok: false, error: "unsupported_tab" };
  await chrome.debugger.attach({ tabId: tab.id }, debuggerVersion).catch(() => { throw new Error("debugger_attach_failed"); });
  try {
    const response = await fetch(`${workerBase}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "codemode",
        origin: page.origin,
        appId: "echo-codemode",
        capabilities: [{ name: "page.evaluate", effect: "mutation" }],
      }),
    });
    if (!response.ok) throw new Error(`session_mint_failed_${response.status}`);
    const minted = await response.json() as { id: string; pageToken: string; mcpToken: string; expiresAt: number };
    const expiresAt = Math.min(minted.expiresAt * 1000, Date.now() + Math.max(250, Math.min(durationMs, 10 * 60_000)));
    const session: SessionState = {
      tabId: tab.id,
      origin: page.origin,
      workerBase,
      sessionId: minted.id,
      pageToken: minted.pageToken,
      mcpUrl: `${workerBase}/mcp?id=${encodeURIComponent(minted.mcpToken)}`,
      expiresAt,
    };
    state = session;
    await connectSocket(session);
    await chrome.alarms.create(expiryAlarm, { when: expiresAt });
    await chrome.storage.session.set({ echoStatus: { active: true, origin: page.origin, expiresAt } });
    await chrome.action.setBadgeBackgroundColor({ color: "#f6821f" });
    await chrome.action.setBadgeText({ text: "FULL" });
    return { ok: true, mcpUrl: session.mcpUrl, origin: page.origin, expiresAt };
  } catch (error) {
    await stopSession("approval_failed");
    return { ok: false, error: error instanceof Error ? error.message : "approval_failed" };
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (state?.tabId !== tabId || !changeInfo.url) return;
  if (validPage(changeInfo.url)?.origin !== state.origin) void stopSession("origin_changed");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state?.tabId === tabId) void stopSession("tab_closed");
});

chrome.debugger.onDetach.addListener((source) => {
  if (state?.tabId === source.tabId && !stopping) void stopSession("debugger_detached");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === expiryAlarm) void stopSession("expired");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "approve") {
    approve(
      typeof message.tabId === "number" ? message.tabId : undefined,
      typeof message.durationMs === "number" ? message.durationMs : undefined,
    ).then(sendResponse);
    return true;
  }
  if (message?.type === "stop") {
    stopSession("user_stopped").then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "status") {
    chrome.storage.session.get(["echoStatus", "echoLastReceipt"]).then((stored) => sendResponse({
      active: !!state,
      origin: state?.origin,
      expiresAt: state?.expiresAt,
      mcpUrl: state?.mcpUrl,
      status: stored.echoStatus,
      lastReceipt: stored.echoLastReceipt,
    }));
    return true;
  }
  return false;
});
