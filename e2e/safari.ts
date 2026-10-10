import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { json, type Json } from "../src/schema";
import type { JsonObject } from "./cdp";

const driverReply = z.object({ value: json.optional() });

const mcpReply = z.object({
  result: z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.object({ error: z.string().optional() }).passthrough().optional(),
    })
    .optional(),
});

const createdSession = z.object({
  sessionId: z.string(),
  capabilities: z.record(z.string(), json),
});

const pageState = z.object({ draft: z.string(), status: z.string() });

const appOrigin = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const driver = process.env.SAFARIDRIVER_ORIGIN ?? "http://127.0.0.1:9444";

const output = new URL("../receipts/extension-free/safari-local/", import.meta.url).pathname;

await mkdir(output, { recursive: true });

async function webdriver(method: string, path: string, body?: Json): Promise<Json | undefined> {
  const response = await fetch(`${driver}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const value = driverReply.parse(await response.json());

  if (!response.ok) throw new Error(JSON.stringify(value.value));

  return value.value;
}

async function callMcp(
  endpoint: string,
  id: number,
  args: JsonObject,
): Promise<{ http: number; ok: boolean; error: string | null }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: "echo_call_capability", arguments: args },
    }),
  });

  const body = mcpReply.parse(await response.json());

  return {
    http: response.status,
    ok: !body.result?.isError,
    error: body.result?.structuredContent?.error ?? null,
  };
}

const created = createdSession.parse(
  await webdriver("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "safari", acceptInsecureCerts: false } },
  }),
);

const sessionId = created.sessionId;

const sessionPath = `/session/${sessionId}`;

async function execute<T>(script: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await webdriver("POST", `${sessionPath}/execute/sync`, { script, args: [] }));
}

async function waitFor(script: string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await execute(script, json)) === expected) return;
    await Bun.sleep(100);
  }

  throw new Error(`safari_wait_timeout:${expected}`);
}

try {
  await webdriver("POST", `${sessionPath}/url`, { url: `${appOrigin}/demo/` });
  await waitFor("return document.readyState", "complete");
  await execute("document.querySelector('#connect').click();return true", json);
  await waitFor("return document.querySelector('#status').textContent", "Agent access active");

  const endpoint = await execute(
    "return document.querySelector('#session').textContent",
    z.string(),
  );

  const calls = {
    denied: await callMcp(endpoint, 0, {
      name: "stopEcho",
      input: {},
      operationId: "safari-denied-1",
    }),
    read: await callMcp(endpoint, 1, { name: "readState", input: {} }),
    mutate: await callMcp(endpoint, 2, {
      name: "setDraft",
      input: { text: "Updated by local Safari" },
      operationId: "safari-local-1",
    }),
    duplicate: await callMcp(endpoint, 3, {
      name: "setDraft",
      input: { text: "Duplicate must not run" },
      operationId: "safari-local-1",
    }),
  };

  const beforeStop = await execute(
    "return {draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent,activity:document.querySelector('#activity').textContent}",
    pageState.extend({ activity: z.string() }),
  );

  await execute("document.querySelector('#stop').click();return true", json);
  await Bun.sleep(500);
  const afterStopCall = await callMcp(endpoint, 9, { name: "readState", input: {} });

  const afterStop = await execute(
    "return {draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent}",
    pageState,
  );

  await execute("document.querySelector('#connect').click();return true", json);
  await waitFor("return document.querySelector('#status').textContent", "Agent access active");

  const uncertainEndpoint = await execute(
    "return document.querySelector('#session').textContent",
    z.string(),
  );

  const pendingUncertain = callMcp(uncertainEndpoint, 10, {
    name: "uncertainMutation",
    input: { text: "Uncertain Safari effect" },
    operationId: "safari-uncertain-1",
  });

  await waitFor("return document.querySelector('#draft').value", "Uncertain Safari effect");
  await execute("document.querySelector('#stop').click();return true", json);
  const uncertainCall = await pendingUncertain;

  const uncertainDuplicate = await callMcp(uncertainEndpoint, 11, {
    name: "uncertainMutation",
    input: { text: "Must not repeat" },
    operationId: "safari-uncertain-1",
  });

  const uncertainPage = await execute(
    "return {draft:document.querySelector('#draft').value,status:document.querySelector('#status').textContent}",
    pageState,
  );

  const screenshot = z.string().parse(await webdriver("GET", `${sessionPath}/screenshot`));
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot, "base64"));

  const passed =
    calls.denied.ok === false &&
    calls.denied.error === "capability_not_granted" &&
    [calls.read, calls.mutate, calls.duplicate].every((value) => value.ok) &&
    beforeStop.draft === "Updated by local Safari" &&
    beforeStop.status === "Agent access active" &&
    afterStopCall.error === "session_closed" &&
    afterStop.draft === "Updated by local Safari" &&
    afterStop.status === "Agent access stopped" &&
    uncertainCall.error === "session_closed" &&
    uncertainDuplicate.error === "outcome_unknown" &&
    uncertainPage.draft === "Uncertain Safari effect" &&
    uncertainPage.status === "Agent access stopped";

  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim: "The extension-free Echo client works in a real Safari tab.",
    environment: {
      browser: "Safari",
      browserVersion: created.capabilities.browserVersion,
      capabilities: created.capabilities,
      appOrigin,
    },
    transport: {
      extension: false,
      productWebDriver: false,
      nativeWebMcp: false,
      referee: "SafariDriver WebDriver",
    },
    observations: {
      calls,
      beforeStop,
      afterStop: { ...afterStop, call: afterStopCall },
      uncertain: { call: uncertainCall, duplicate: uncertainDuplicate, page: uncertainPage },
    },
    independentEvidence: [
      "Safari DOM values read by the E2E referee",
      "receipts/extension-free/safari-local/stopped.png",
    ],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: [
      "WebDriver is used by the independent test referee, not by Echo's product transport.",
      "The Worker runs locally on loopback.",
    ],
  };

  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  if (!passed) throw new Error("safari_e2e_failed");
  console.log(
    `PASS: Safari ${String(created.capabilities.browserVersion ?? "unknown")} extension-free cross-origin authorization, read, mutation, deduplication, uncertainty, and Stop`,
  );
} finally {
  await webdriver("DELETE", sessionPath).catch(() => undefined);
}
