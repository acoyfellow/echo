import { createEcho } from "../client";

const title = document.querySelector<HTMLElement>("#title");
const draft = document.querySelector<HTMLTextAreaElement>("#draft");
const connect = document.querySelector<HTMLButtonElement>("#connect");
const stop = document.querySelector<HTMLButtonElement>("#stop");
const status = document.querySelector<HTMLElement>("#status");
const session = document.querySelector<HTMLElement>("#session");
const activity = document.querySelector<HTMLElement>("#activity");

if (!title || !draft || !connect || !stop || !status || !session || !activity) throw new Error("demo_markup_missing");

const workerBase = document.body.dataset.workerBase || window.location.origin;
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
    session.textContent = connected.mcpUrl;
    stop.disabled = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Connection failed";
    connect.disabled = false;
  }
});

stop.addEventListener("click", () => {
  echo.stop();
  status.textContent = "Agent access stopped";
  session.textContent = "";
  stop.disabled = true;
  connect.disabled = false;
});
