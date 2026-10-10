import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const binary = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), "echo-chrome-"));
const output = new URL("../receipts/codemode-run/chrome-local/", import.meta.url).pathname;
await mkdir(output, { recursive: true });

const chrome = Bun.spawn([
  binary,
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-default-apps",
  `${base}/examples/todo/`,
], { stdout: "ignore", stderr: "ignore" });

async function waitForTarget(): Promise<{ webSocketDebuggerUrl: string }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("chrome_target_timeout");
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve(), { once: true });
  socket.addEventListener("error", () => reject(new Error("cdp_socket_failed")), { once: true });
});
let nextId = 0;
const pending = new Map<number, (message: Record<string, unknown>) => void>();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as { id?: number } & Record<string, unknown>;
  if (message.id) pending.get(message.id)?.(message);
});

async function cdp(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = ++nextId;
  const result = new Promise<Record<string, unknown>>((resolve) => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params }));
  const message = await result;
  pending.delete(id);
  if (message.error) throw new Error(JSON.stringify(message.error));
  return message.result as Record<string, unknown>;
}

async function evaluate<T>(expression: string, awaitPromise = true): Promise<T> {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  const remote = result.result as { value?: T; description?: string };
  if (!("value" in remote)) throw new Error(remote.description ?? "evaluation_failed");
  return remote.value as T;
}

async function mcp(endpoint: string, id: number, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await response.json() as { result?: { structuredContent?: Record<string, unknown> }; error?: unknown };
  return body.result?.structuredContent ?? { ok: false, error: JSON.stringify(body.error ?? null), http: response.status };
}

const script = `
const before = await app.listTodos({});
for (const todo of before) if (!todo.completed) await app.setCompleted({ id: todo.id, completed: true });
for (const text of ["Ship Codemode", "Delete the extension", "Tell people"]) await app.addTodo({ text });
const after = await app.listTodos({});
return { before: before.length, after: after.length, open: after.filter((todo) => !todo.completed).map((todo) => todo.text) };
`;

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("document.documentElement.dataset.hydrated === 'true'")) break;
    await Bun.sleep(100);
  }
  await evaluate("localStorage.removeItem('echo-tiny-todos'); true");
  await cdp("Page.reload");
  await Bun.sleep(300);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("document.documentElement.dataset.hydrated === 'true'")) break;
    await Bun.sleep(100);
  }
  await evaluate("document.querySelector('#connect').click(); true");
  let endpoint = "";
  for (let attempt = 0; attempt < 100 && !endpoint; attempt += 1) {
    endpoint = await evaluate<string>("document.querySelector('#session')?.textContent ?? ''");
    if (!endpoint) await Bun.sleep(100);
  }
  if (!endpoint) throw new Error("connect_failed");
  const described = await mcp(endpoint, 1, "echo_describe", {});
  const run = await mcp(endpoint, 2, "echo_run", { code: script, runId: "e2e-1" });
  const replay = await mcp(endpoint, 3, "echo_run", { code: script, runId: "e2e-1" });
  const sandboxed = await mcp(endpoint, 4, "echo_run", { code: "return await fetch('https://example.com').then((r) => r.status);", runId: "e2e-network" });
  const referee = await evaluate<{ texts: string[]; completed: boolean[] }>(`({
    texts: [...document.querySelectorAll('[data-complete]')].map((box) => box.closest('div').querySelector('span').textContent),
    completed: [...document.querySelectorAll('[data-complete]')].map((box) => box.checked),
  })`);
  await evaluate("document.querySelector('#stop').click(); true");
  await Bun.sleep(500);
  const afterStop = await mcp(endpoint, 5, "echo_run", { code: "return app.listTodos({});", runId: "e2e-after-stop" });
  const version = await cdp("Browser.getVersion") as { product?: string; userAgent?: string };
  const screenshot = await cdp("Page.captureScreenshot", { format: "png" }) as { data: string };
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot.data, "base64"));
  const runResult = run.result as { before?: number; after?: number; open?: string[] } | undefined;
  const runCalls = run.calls as Array<{ capability: string; ok: boolean }> | undefined;
  const checks = {
    describeListsTodoTools: String((described.result as { declarations?: string } | undefined)?.declarations ?? "").includes('"addTodo"'),
    runSucceeded: run.ok === true,
    runComposedEveryCall: runCalls?.length === 7 && runCalls.every((call) => call.ok) && runCalls.map((call) => call.capability).join(",") === "listTodos,setCompleted,setCompleted,addTodo,addTodo,addTodo,listTodos",
    runResultMatches: runResult?.before === 3 && runResult.after === 6 && JSON.stringify(runResult.open) === JSON.stringify(["Ship Codemode", "Delete the extension", "Tell people"]),
    refereeSeesSixTodos: referee.texts.length === 6 && referee.texts.slice(3).join("|") === "Ship Codemode|Delete the extension|Tell people",
    refereeSeesOldTodosCompleted: referee.completed.slice(0, 3).every(Boolean),
    replayRefused: replay.ok === false && replay.error === "run_id_reused",
    sandboxHasNoNetwork: sandboxed.ok === false,
    stopEndsRuns: afterStop.ok === false,
  };
  const passed = Object.values(checks).every(Boolean);
  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim: "An agent composes many app capabilities in one echo_run script against a real Chrome tab, with no extension.",
    environment: { browser: version.product, userAgent: version.userAgent, origin: base },
    transport: { extension: false, productCdp: false, sandbox: "Worker Loader, globalOutbound null", referee: "Chrome DevTools Protocol" },
    checks,
    observations: { run, replay, sandboxed, afterStop, referee },
    independentEvidence: ["Chrome DOM values read by the E2E referee", "receipts/codemode-run/chrome-local/stopped.png"],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: ["CDP is used by the independent test referee to press Connect and Stop and to read the DOM, not by Echo.", "The Worker runs locally on loopback."],
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!passed) {
    console.error(JSON.stringify({ checks, observations: receipt.observations }, null, 2));
    throw new Error("codemode_run_e2e_failed");
  }
  console.log(`PASS: ${version.product} echo_run composed 7 capability calls in one script, refused replay, had no network, and stopped`);
} finally {
  socket.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}
