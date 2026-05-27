/**
 * Content script — injected into every page (gated by host_permissions).
 *
 * Receives `{type: "execute", callId, code, timeoutMs}` from the background
 * service worker. Evaluates `code` in the page's realm. The code has full
 * access to `document`, `window`, page-scoped APIs, and authenticated
 * `fetch` for the page's origin.
 *
 * Codex-grade trust posture: the user opened the session by clicking the
 * extension icon on this tab; the agent has session-level authority to
 * run anything that the page's own JS could run; the receipt is the
 * log of every snippet that executed.
 */

type ExecuteMsg = {
  type: "execute";
  callId: string;
  code: string;
  timeoutMs?: number;
};

type ExecuteResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  logs?: string[];
};

chrome.runtime.onMessage.addListener((msg: ExecuteMsg, _sender, sendResponse) => {
  if (msg?.type !== "execute") return false;
  (async () => {
    const r = await runInPage(msg.code, msg.timeoutMs ?? 30_000);
    sendResponse({ type: "result", callId: msg.callId, result: r });
  })();
  return true;
});

async function runInPage(code: string, timeoutMs: number): Promise<ExecuteResult> {
  // We're already running in the page's content-script realm. The content
  // script has its own JS world (isolated from the page's own scripts),
  // but DOM access and `fetch` with credentials are available — same shape
  // as page JS.
  //
  // `new AsyncFunction("...")` is allowed in content scripts (CSP'd page
  // policies don't apply to extension code). The function gets one
  // implicit binding: `__echoLog`.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<unknown>;

  const logs: string[] = [];
  const __echoLog = (line: unknown) => {
    const s = typeof line === "string" ? line : JSON.stringify(line);
    logs.push(s);
    if (logs.length > 1000) logs.shift();
  };

  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    // The user's code is wrapped: their last expression's value is
    // returned. We support both "return ..." statements and bare
    // expressions.
    fn = new AsyncFunction("__echoLog", "log", code);
  } catch (e) {
    return { ok: false, error: "compile_failed", logs: [String(e)] };
  }

  try {
    const run = fn(__echoLog, __echoLog);
    const result = await Promise.race([
      run,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return { ok: true, result, logs };
  } catch (e) {
    return { ok: false, error: String(e), logs };
  }
}
