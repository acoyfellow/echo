import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const binary = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), "echo-chrome-"));
const output = new URL("../receipts/extension-free/chrome-local/", import.meta.url).pathname;
await mkdir(output, { recursive: true });

const chrome = Bun.spawn([
  binary,
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-default-apps",
  `${base}/demo/`,
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

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("document.readyState") === "complete") break;
    await Bun.sleep(100);
  }
  await evaluate("document.querySelector('#connect').click(); true");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("document.querySelector('#status').textContent") === "Agent access active") break;
    await Bun.sleep(100);
  }
  const calls = await evaluate<{ read: unknown; mutate: unknown; duplicate: unknown }>(`(async()=>{
    const endpoint=document.querySelector('#session').textContent;
    const call=async(id,args)=>{
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'echo_call_capability',arguments:args}})});
      const body=await response.json();
      return {http:response.status,ok:!body.result?.isError,error:body.result?.structuredContent?.error??null};
    };
    return {
      read:await call(1,{name:'readState',input:{}}),
      mutate:await call(2,{name:'setDraft',input:{text:'Updated by local Chrome'},operationId:'chrome-local-1'}),
      duplicate:await call(3,{name:'setDraft',input:{text:'Duplicate must not run'},operationId:'chrome-local-1'})
    };
  })()`);
  const beforeStop = await evaluate<{ draft: string; status: string; activity: string }>(`({
    draft:document.querySelector('#draft').value,
    status:document.querySelector('#status').textContent,
    activity:document.querySelector('#activity').textContent
  })`);
  await evaluate("window.__echoTestMcp=document.querySelector('#session').textContent;document.querySelector('#stop').click();true");
  await Bun.sleep(500);
  const afterStop = await evaluate<{ http: number; error: string | null; draft: string; status: string }>(`(async()=>{
    const response=await fetch(window.__echoTestMcp,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'echo_call_capability',arguments:{name:'readState',input:{}}}})});
    const body=await response.json();
    delete window.__echoTestMcp;
    return {http:response.status,error:body.result?.structuredContent?.error??body.error??null,draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent};
  })()`);
  const version = await cdp("Browser.getVersion") as { product?: string; userAgent?: string };
  const screenshot = await cdp("Page.captureScreenshot", { format: "png" }) as { data: string };
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot.data, "base64"));
  const passed = [calls.read, calls.mutate, calls.duplicate].every((value) => (value as { ok?: boolean }).ok)
    && beforeStop.draft === "Updated by local Chrome"
    && beforeStop.status === "Agent access active"
    && afterStop.error === "session_closed"
    && afterStop.draft === "Updated by local Chrome"
    && afterStop.status === "Agent access stopped";
  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim: "The extension-free Echo client works in a real Chrome tab.",
    environment: { browser: version.product, userAgent: version.userAgent, origin: base },
    transport: { extension: false, productCdp: false, nativeWebMcp: false, referee: "Chrome DevTools Protocol" },
    observations: { calls, beforeStop, afterStop },
    independentEvidence: ["Chrome DOM values read by the E2E referee", "receipts/extension-free/chrome-local/stopped.png"],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: ["CDP is used by the independent test referee, not by Echo's product transport.", "The Worker runs locally on loopback."],
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!passed) throw new Error("chrome_e2e_failed");
  console.log(`PASS: ${version.product} extension-free read, mutation, deduplication, and Stop`);
} finally {
  socket.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}
