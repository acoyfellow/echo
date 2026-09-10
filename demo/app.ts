import { createEcho } from "../client";

const title = document.querySelector<HTMLElement>("#title");
const draft = document.querySelector<HTMLTextAreaElement>("#draft");
const connect = document.querySelector<HTMLButtonElement>("#connect");
const run = document.querySelector<HTMLButtonElement>("#run");
const stop = document.querySelector<HTMLButtonElement>("#stop");
const status = document.querySelector<HTMLElement>("#status");
const session = document.querySelector<HTMLElement>("#session");
const activity = document.querySelector<HTMLElement>("#activity");

if (!title || !draft || !connect || !run || !stop || !status || !session || !activity) throw new Error("demo_markup_missing");

const workerBase = document.body.dataset.workerBase || window.location.origin;
let mcpUrl = "";
const echo = createEcho({
  workerBase,
  appId: "echo-notes-demo",
  onActivity(event) {
    activity.textContent = `${event.status}: ${event.capability}`;
  },
});

echo.register({
  readState: {
    description: "Read the demo title and draft",
    effect: "read",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { title: { type: "string" }, draft: { type: "string" } },
      required: ["title", "draft"],
    },
    run() {
      return { title: title.textContent ?? "", draft: draft.value };
    },
  },
  setDraft: {
    description: "Replace the demo draft",
    effect: "mutation",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", maxLength: 2000 } },
      required: ["text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { draft: { type: "string" } },
      required: ["draft"],
    },
    run(input) {
      const value = input as { text?: unknown };
      if (typeof value.text !== "string" || value.text.length > 2000) throw new Error("draft_invalid");
      draft.value = value.text;
      draft.dispatchEvent(new Event("input", { bubbles: true }));
      return { draft: draft.value };
    },
  },
  uncertainMutation: {
    description: "Test a disconnect after a visible mutation and before its result",
    effect: "mutation",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", maxLength: 2000 } },
      required: ["text"],
      additionalProperties: false,
    },
    async run(input) {
      const value = input as { text?: unknown };
      if (typeof value.text !== "string" || value.text.length > 2000) throw new Error("draft_invalid");
      draft.value = value.text;
      draft.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return { draft: draft.value };
    },
  },
});

connect.addEventListener("click", async () => {
  connect.disabled = true;
  status.textContent = "Connecting";
  try {
    const connected = await echo.connect();
    status.textContent = "Agent access active";
    mcpUrl = connected.mcpUrl;
    session.textContent = "Session ready";
    run.disabled = false;
    stop.disabled = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Connection failed";
    connect.disabled = false;
  }
});

run.addEventListener("click", async () => {
  run.disabled = true;
  status.textContent = "Running deterministic demo";
  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "echo_call_capability",
          arguments: {
            name: "setDraft",
            input: { text: "Updated through Echo" },
            operationId: crypto.randomUUID(),
          },
        },
      }),
    });
    const result = await response.json() as { result?: { isError?: boolean } };
    status.textContent = result.result?.isError ? "Demo task failed" : "Demo task complete";
  } catch {
    status.textContent = "Demo task failed";
  } finally {
    run.disabled = false;
  }
});

stop.addEventListener("click", () => {
  echo.stop();
  mcpUrl = "";
  status.textContent = "Agent access stopped";
  session.textContent = "";
  run.disabled = true;
  stop.disabled = true;
  connect.disabled = false;
});
