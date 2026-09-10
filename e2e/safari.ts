import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";
const driver = process.env.SAFARIDRIVER_ORIGIN ?? "http://127.0.0.1:9444";
const output = new URL("../receipts/extension-free/safari-local/", import.meta.url).pathname;
await mkdir(output, { recursive: true });

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${driver}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json() as { value?: unknown };
  if (!response.ok) throw new Error(JSON.stringify(value.value));
  return value.value;
}

const created = await request("POST", "/session", {
  capabilities: { alwaysMatch: { browserName: "safari", acceptInsecureCerts: false } },
}) as { sessionId: string; capabilities: Record<string, unknown> };
const sessionId = created.sessionId;
const path = `/session/${sessionId}`;

async function execute<T>(script: string, args: unknown[] = []): Promise<T> {
  return request("POST", `${path}/execute/sync`, { script, args }) as Promise<T>;
}

try {
  await request("POST", `${path}/url`, { url: `${base}/demo/` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await execute<string>("return document.readyState") === "complete") break;
    await Bun.sleep(100);
  }
  await execute("document.querySelector('#connect').click(); return true");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await execute<string>("return document.querySelector('#status').textContent") === "Agent access active") break;
    await Bun.sleep(100);
  }
  const asyncCalls = await request("POST", `${path}/execute/async`, {
    script: `const done=arguments[arguments.length-1];
      (async()=>{
        const endpoint=document.querySelector('#session').textContent;
        const call=async(id,args)=>{
          const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'echo_call_capability',arguments:args}})});
          const body=await response.json();
          return {http:response.status,ok:!body.result?.isError,error:body.result?.structuredContent?.error??null};
        };
        return {
          denied:await call(0,{name:'stopEcho',input:{},operationId:'safari-denied-1'}),
          read:await call(1,{name:'readState',input:{}}),
          mutate:await call(2,{name:'setDraft',input:{text:'Updated by local Safari'},operationId:'safari-local-1'}),
          duplicate:await call(3,{name:'setDraft',input:{text:'Duplicate must not run'},operationId:'safari-local-1'})
        };
      })().then(done, error=>done({fatal:String(error)}));`,
    args: [],
  }) as { denied: { ok?: boolean; error?: string }; read: { ok?: boolean }; mutate: { ok?: boolean }; duplicate: { ok?: boolean }; fatal?: string };
  const beforeStop = await execute<{ draft: string; status: string; activity: string }>("return {draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent,activity:document.querySelector('#activity').textContent}");
  await execute("window.__echoTestMcp=document.querySelector('#session').textContent;document.querySelector('#stop').click();return true");
  await Bun.sleep(500);
  const afterStop = await request("POST", `${path}/execute/async`, {
    script: `const done=arguments[arguments.length-1];
      (async()=>{
        const response=await fetch(window.__echoTestMcp,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'echo_call_capability',arguments:{name:'readState',input:{}}}})});
        const body=await response.json();delete window.__echoTestMcp;
        return {http:response.status,error:body.result?.structuredContent?.error??body.error??null,draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent};
      })().then(done, error=>done({fatal:String(error)}));`,
    args: [],
  }) as { http: number; error: string | null; draft: string; status: string; fatal?: string };
  await execute("document.querySelector('#connect').click();return true");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await execute<string>("return document.querySelector('#status').textContent") === "Agent access active") break;
    await Bun.sleep(100);
  }
  const uncertain = await request("POST", `${path}/execute/async`, {
    script: `const done=arguments[arguments.length-1];
      (async()=>{
        const endpoint=document.querySelector('#session').textContent;
        window.__echoUncertainMcp=endpoint;
        setTimeout(()=>document.querySelector('#stop').click(),100);
        const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:10,method:'tools/call',params:{name:'echo_call_capability',arguments:{name:'uncertainMutation',input:{text:'Uncertain Safari effect'},operationId:'safari-uncertain-1'}}})});
        const body=await response.json();
        return {first:body.result?.structuredContent?.error??null,draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent};
      })().then(done, error=>done({fatal:String(error)}));`,
    args: [],
  }) as { first: string | null; draft: string; status: string; fatal?: string };
  await Bun.sleep(500);
  const uncertainDuplicate = await request("POST", `${path}/execute/async`, {
    script: `const done=arguments[arguments.length-1];
      fetch(window.__echoUncertainMcp,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:11,method:'tools/call',params:{name:'echo_call_capability',arguments:{name:'uncertainMutation',input:{text:'Must not repeat'},operationId:'safari-uncertain-1'}}})}).then(r=>r.json()).then(body=>{delete window.__echoUncertainMcp;done({error:body.result?.structuredContent?.error??null,draft:document.querySelector('#draft').value})},error=>done({fatal:String(error)}));`,
    args: [],
  }) as { error: string | null; draft: string; fatal?: string };
  const screenshot = await request("GET", `${path}/screenshot`) as string;
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot, "base64"));
  const passed = !asyncCalls.fatal
    && asyncCalls.denied.ok === false
    && asyncCalls.denied.error === "capability_not_granted"
    && [asyncCalls.read, asyncCalls.mutate, asyncCalls.duplicate].every((value) => value.ok)
    && beforeStop.draft === "Updated by local Safari"
    && beforeStop.status === "Agent access active"
    && afterStop.error === "session_closed"
    && afterStop.draft === "Updated by local Safari"
    && afterStop.status === "Agent access stopped"
    && !uncertain.fatal
    && uncertain.first === "session_closed"
    && uncertain.draft === "Uncertain Safari effect"
    && uncertain.status === "Agent access stopped"
    && uncertainDuplicate.error === "outcome_unknown"
    && uncertainDuplicate.draft === "Uncertain Safari effect";
  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim: "The extension-free Echo client works in a real Safari tab.",
    environment: { browser: "Safari", browserVersion: created.capabilities.browserVersion, capabilities: created.capabilities, origin: base },
    transport: { extension: false, productWebDriver: false, nativeWebMcp: false, referee: "SafariDriver WebDriver" },
    observations: { calls: asyncCalls, beforeStop, afterStop, uncertain, uncertainDuplicate },
    independentEvidence: ["Safari DOM values read by the E2E referee", "receipts/extension-free/safari-local/stopped.png"],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: ["WebDriver is used by the independent test referee, not by Echo's product transport.", "The Worker runs locally on loopback."],
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!passed) throw new Error("safari_e2e_failed");
  console.log(`PASS: Safari ${String(created.capabilities.browserVersion ?? "unknown")} extension-free authorization, read, mutation, deduplication, uncertainty, and Stop`);
} finally {
  await request("DELETE", path).catch(() => undefined);
}
