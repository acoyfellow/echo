import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { browserVersion, callTool, launchChrome, screenshotData } from "./cdp";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const output = new URL("../receipts/codemode-run/chrome-local/", import.meta.url).pathname;

await mkdir(output, { recursive: true });

const browser = await launchChrome(`${base}${process.env.ECHO_E2E_PATH ?? "/examples/todo/"}`);

const { cdp, evaluate, run } = browser;

const runResultSchema = z
  .object({ before: z.number(), after: z.number(), open: z.array(z.string()) })
  .partial();

const runCallsSchema = z.array(z.object({ capability: z.string(), ok: z.boolean() }));

const describeResult = z.object({ declarations: z.string().optional() }).passthrough();

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
    if (await run("document.documentElement.dataset.hydrated === 'true'")) break;
    await Bun.sleep(100);
  }

  await run("localStorage.removeItem('echo-tiny-todos'); true");
  await cdp("Page.reload");
  await Bun.sleep(300);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await run("document.documentElement.dataset.hydrated === 'true'")) break;
    await Bun.sleep(100);
  }

  await run("document.querySelector('#connect').click(); true");
  let endpoint = "";

  for (let attempt = 0; attempt < 100 && !endpoint; attempt += 1) {
    endpoint = await evaluate("document.querySelector('#session')?.textContent ?? ''", z.string());

    if (!endpoint) await Bun.sleep(100);
  }

  if (!endpoint) throw new Error("connect_failed");
  const described = await callTool(endpoint, 1, "echo_describe", {});
  const scripted = await callTool(endpoint, 2, "echo_run", { code: script, runId: "e2e-1" });
  const replay = await callTool(endpoint, 3, "echo_run", { code: script, runId: "e2e-1" });

  const sandboxed = await callTool(endpoint, 4, "echo_run", {
    code: "return await fetch('https://example.com').then((r) => r.status);",
    runId: "e2e-network",
  });

  const referee = await evaluate(
    `({
    texts: [...document.querySelectorAll('[data-complete]')].map((box) => box.closest('div').querySelector('span').textContent),
    completed: [...document.querySelectorAll('[data-complete]')].map((box) => box.checked),
  })`,
    z.object({ texts: z.array(z.string()), completed: z.array(z.boolean()) }),
  );

  await run("document.querySelector('#stop').click(); true");
  await Bun.sleep(500);

  const afterStop = await callTool(endpoint, 5, "echo_run", {
    code: "return app.listTodos({});",
    runId: "e2e-after-stop",
  });

  const version = browserVersion.parse(await cdp("Browser.getVersion"));
  const screenshot = screenshotData.parse(await cdp("Page.captureScreenshot", { format: "png" }));
  await writeFile(join(output, "stopped.png"), Buffer.from(screenshot.data, "base64"));
  const runResult = runResultSchema.optional().catch(undefined).parse(scripted.result);
  const runCalls = runCallsSchema.optional().catch(undefined).parse(scripted.calls);

  const checks = {
    describeListsTodoTools: String(
      describeResult.optional().catch(undefined).parse(described.result)?.declarations ?? "",
    ).includes('"addTodo"'),
    runSucceeded: scripted.ok === true,
    runComposedEveryCall:
      runCalls?.length === 7 &&
      runCalls.every((call) => call.ok) &&
      runCalls.map((call) => call.capability).join(",") ===
        "listTodos,setCompleted,setCompleted,addTodo,addTodo,addTodo,listTodos",
    runResultMatches:
      runResult?.before === 3 &&
      runResult.after === 6 &&
      JSON.stringify(runResult.open) ===
        JSON.stringify(["Ship Codemode", "Delete the extension", "Tell people"]),
    refereeSeesSixTodos:
      referee.texts.length === 6 &&
      referee.texts.slice(3).join("|") === "Ship Codemode|Delete the extension|Tell people",
    refereeSeesOldTodosCompleted: referee.completed.slice(0, 3).every(Boolean),
    replayRefused: replay.ok === false && replay.error === "run_id_reused",
    sandboxHasNoNetwork: sandboxed.ok === false,
    stopEndsRuns: afterStop.ok === false,
  };

  const passed = Object.values(checks).every(Boolean);

  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim:
      "An agent composes many app capabilities in one echo_run script against a real Chrome tab, with no extension.",
    environment: { browser: version.product, userAgent: version.userAgent, origin: base },
    transport: {
      extension: false,
      productCdp: false,
      sandbox: "Worker Loader, globalOutbound null",
      referee: "Chrome DevTools Protocol",
    },
    checks,
    observations: { run: scripted, replay, sandboxed, afterStop, referee },
    independentEvidence: [
      "Chrome DOM values read by the E2E referee",
      "receipts/codemode-run/chrome-local/stopped.png",
    ],
    redactions: ["MCP session credential", "Worker signing secret"],
    limitations: [
      "CDP is used by the independent test referee to press Connect and Stop and to read the DOM, not by Echo.",
      "The Worker runs locally on loopback.",
    ],
  };

  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  if (!passed) {
    console.error(JSON.stringify({ checks, observations: receipt.observations }, null, 2));
    throw new Error("codemode_run_e2e_failed");
  }

  console.log(
    `PASS: ${version.product} echo_run composed 7 capability calls in one script, refused replay, had no network, and stopped`,
  );
} finally {
  await browser.close();
}
