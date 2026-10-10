import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { browserVersion, launchChrome, screenshotData } from "./cdp";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const output = new URL("../receipts/extension-free/chrome-local/", import.meta.url).pathname;

await mkdir(output, { recursive: true });

const browser = await launchChrome(`${base}/demo/`);

const { cdp, evaluate, run } = browser;

const callOutcome = z.object({ http: z.number(), ok: z.boolean(), error: z.string().nullable() });

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await run("document.readyState")) === "complete") break;
    await Bun.sleep(100);
  }

  await run("document.querySelector('#connect').click(); true");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await run("document.querySelector('#status').textContent")) === "Agent access active")
      break;
    await Bun.sleep(100);
  }

  const calls = await evaluate(
    `(async()=>{
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
  })()`,
    z.object({ read: callOutcome, mutate: callOutcome, duplicate: callOutcome }),
  );

  const beforeStop = await evaluate(
    `({
    draft:document.querySelector('#draft').value,
    status:document.querySelector('#status').textContent,
    activity:document.querySelector('#activity').textContent
  })`,
    z.object({ draft: z.string(), status: z.string(), activity: z.string() }),
  );

  await run(
    "window.__echoTestMcp=document.querySelector('#session').textContent;document.querySelector('#stop').click();true",
  );
  await Bun.sleep(500);

  const afterStop = await evaluate(
    `(async()=>{
    const response=await fetch(window.__echoTestMcp,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'echo_call_capability',arguments:{name:'readState',input:{}}}})});
    const body=await response.json();
    delete window.__echoTestMcp;
    return {http:response.status,error:body.result?.structuredContent?.error??body.error??null,draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent};
  })()`,
    z.object({ http: z.number(), error: z.json(), draft: z.string(), status: z.string() }),
  );

  const version = browserVersion.parse(await cdp("Browser.getVersion"));
  const screenshot = screenshotData.parse(await cdp("Page.captureScreenshot", { format: "png" }));
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot.data, "base64"));

  const passed =
    [calls.read, calls.mutate, calls.duplicate].every((value) => value.ok) &&
    beforeStop.draft === "Updated by local Chrome" &&
    beforeStop.status === "Agent access active" &&
    afterStop.error === "session_closed" &&
    afterStop.draft === "Updated by local Chrome" &&
    afterStop.status === "Agent access stopped";

  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim: "The extension-free Echo client works in a real Chrome tab.",
    environment: { browser: version.product, userAgent: version.userAgent, origin: base },
    transport: {
      extension: false,
      productCdp: false,
      nativeWebMcp: false,
      referee: "Chrome DevTools Protocol",
    },
    observations: { calls, beforeStop, afterStop },
    independentEvidence: [
      "Chrome DOM values read by the E2E referee",
      "receipts/extension-free/chrome-local/stopped.png",
    ],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: [
      "CDP is used by the independent test referee, not by Echo's product transport.",
      "The Worker runs locally on loopback.",
    ],
  };

  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  if (!passed) throw new Error("chrome_e2e_failed");
  console.log(`PASS: ${version.product} extension-free read, mutation, deduplication, and Stop`);
} finally {
  await browser.close();
}
