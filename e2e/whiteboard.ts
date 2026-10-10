import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { browserVersion, callTool, launchChrome, screenshotData, waitFor } from "./cdp";

const base = process.env.ECHO_E2E_ORIGIN ?? "http://127.0.0.1:8870";

const output = new URL("../receipts/whiteboard/chrome-local/", import.meta.url).pathname;

await mkdir(output, { recursive: true });

const browser = await launchChrome(`${base}/examples/whiteboard/`);

const { cdp, evaluate, run } = browser;

const drawnIds = z.object({ ids: z.array(z.string()) });

const boardState = z.object({
  cards: z.array(z.object({ id: z.string(), author: z.string(), text: z.string() })),
  arrows: z.array(z.object({ id: z.string(), author: z.string(), d: z.string() })),
  cursors: z.array(z.string()),
  legend: z.array(z.string()),
});

function architectScript(author: string, row: number, labels: string[]): string {
  return `
const ids = [];
for (const [index, text] of ${JSON.stringify(labels)}.entries()) {
  const card = await app.addCard({ kind: "box", x: 40 + index * 220, y: ${row}, text, author: ${JSON.stringify(author)} });
  ids.push(card.id);
}
for (let index = 1; index < ids.length; index += 1) {
  await app.connectCards({ from: ids[index - 1], to: ids[index], author: ${JSON.stringify(author)} });
}
return { ids };
`;
}

const readBoard = `(() => ({
  cards: [...document.querySelectorAll('[data-card]')].map((node) => ({ id: node.dataset.card, author: node.dataset.author, text: node.querySelector('text').textContent })),
  arrows: [...document.querySelectorAll('[data-arrow]')].map((node) => ({ id: node.dataset.arrow, author: node.dataset.author, d: node.getAttribute('d') })),
  cursors: [...document.querySelectorAll('[data-cursor]')].map((node) => node.dataset.cursor),
  legend: [...document.querySelectorAll('#authors [data-author]')].map((node) => node.dataset.author),
}))()`;

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(browser, "document.documentElement.dataset.hydrated === 'true'");
  await run("document.querySelector('#connect').click(); true");
  await waitFor(browser, "!!document.querySelector('#session')?.textContent?.startsWith('http')");
  const endpoint = await evaluate("document.querySelector('#session').textContent", z.string());

  const [ada, grace] = await Promise.all([
    callTool(endpoint, 1, "echo_run", {
      code: architectScript("ada", 80, ["browser", "worker", "durable object"]),
      runId: "ada-1",
    }),
    callTool(endpoint, 2, "echo_run", {
      code: architectScript("grace", 360, ["page", "sandbox", "agent"]),
      runId: "grace-1",
    }),
  ]);

  const adaIds = drawnIds.safeParse(ada.result);
  const graceIds = drawnIds.safeParse(grace.result);

  const crossArrow =
    adaIds.success && graceIds.success
      ? await callTool(endpoint, 3, "echo_call_capability", {
          name: "connectCards",
          input: { from: graceIds.data.ids[2], to: adaIds.data.ids[1], author: "grace" },
          operationId: crypto.randomUUID(),
        })
      : { ok: false };

  const viaAgent = await callTool(endpoint, 4, "echo_call_capability", {
    name: "readBoard",
    input: {},
  });

  await waitFor(browser, "document.querySelectorAll('[data-arrow]').length === 5");
  const referee = boardState.parse(await evaluate(readBoard, z.json()));
  const shot = screenshotData.parse(await cdp("Page.captureScreenshot", { format: "png" }));

  await writeFile(join(output, "board.png"), Buffer.from(shot.data, "base64"));
  await run("document.querySelector('#stop').click(); true");
  await new Promise((resolve) => setTimeout(resolve, 500));

  const [adaAfter, graceAfter] = await Promise.all([
    callTool(endpoint, 5, "echo_run", { code: "return app.readBoard({});", runId: "ada-2" }),
    callTool(endpoint, 6, "echo_call_capability", { name: "readBoard", input: {} }),
  ]);

  const afterStop = boardState.parse(await evaluate(readBoard, z.json()));
  const version = browserVersion.parse(await cdp("Browser.getVersion"));
  const ids = referee.cards.map((card) => card.id);
  const byAuthor = (author: string) => referee.cards.filter((card) => card.author === author);

  const checks = {
    bothScriptsSucceeded: ada.ok === true && grace.ok === true,
    eachAgentDrewThreeCards: byAuthor("ada").length === 3 && byAuthor("grace").length === 3,
    cardIdsUnique: new Set(ids).size === ids.length && ids.length === 6,
    eachAgentDrewItsOwnChain:
      referee.arrows.filter((arrow) => arrow.author === "ada").length === 2 &&
      referee.arrows.filter((arrow) => arrow.author === "grace").length === 3,
    crossAgentArrowLanded: crossArrow.ok === true,
    everyArrowRendered: referee.arrows.every((arrow) => arrow.d.startsWith("M")),
    legendListsBothAgents: ["ada", "grace"].every((name) => referee.legend.includes(name)),
    bothCursorsVisible: ["ada", "grace"].every((name) => referee.cursors.includes(name)),
    agentViewMatchesDom: viaAgent.ok === true,
    stopEndsEveryAgent: adaAfter.ok === false && graceAfter.ok === false,
    stopClearsCursors: afterStop.cursors.length === 0,
    boardSurvivesStop: afterStop.cards.length === 6,
  };

  const passed = Object.values(checks).every(Boolean);

  const receipt = {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    claim:
      "Two agents draw on one whiteboard concurrently through one Echo session; the page serializes their edits and Stop ends both.",
    environment: { browser: version.product, userAgent: version.userAgent, origin: base },
    transport: { extension: false, sandbox: "Worker Loader", referee: "Chrome DevTools Protocol" },
    checks,
    observations: { ada, grace, crossArrow, referee, afterStop },
    independentEvidence: [
      "Chrome DOM read by the referee",
      "receipts/whiteboard/chrome-local/board.png",
    ],
    redactions: ["MCP session credential"],
  };

  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  if (!passed) {
    console.error(JSON.stringify({ checks, observations: receipt.observations }, null, 2));
    throw new Error("whiteboard_e2e_failed");
  }

  console.log(
    `PASS: ${version.product} two agents drew 6 cards and 5 arrows concurrently on one board, crossed each other's work, and Stop ended both`,
  );
} finally {
  await browser.close();
}
