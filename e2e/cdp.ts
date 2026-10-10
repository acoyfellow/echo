import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { json, type Json } from "../src/schema";

export type JsonObject = { [key: string]: Json };

const targetList = z.array(z.object({ type: z.string(), webSocketDebuggerUrl: z.string() }));

const cdpReply = z.object({
  id: z.number().optional(),
  result: z.record(z.string(), json).optional(),
  error: json.optional(),
});

const remoteObject = z.object({
  result: z.object({ value: json.optional(), description: z.string().optional() }),
});

const toolReply = z.object({
  result: z.object({ structuredContent: z.record(z.string(), json).optional() }).optional(),
  error: json.optional(),
});

export const browserVersion = z.object({
  product: z.string().optional(),
  userAgent: z.string().optional(),
});

export const screenshotData = z.object({ data: z.string() });

export type Browser = {
  cdp(method: string, params?: JsonObject): Promise<JsonObject>;
  evaluate<T>(expression: string, schema: z.ZodType<T>, awaitPromise?: boolean): Promise<T>;
  run(expression: string): Promise<Json>;
  close(): Promise<void>;
};

async function waitForTarget(port: number): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = targetList.parse(await response.json()).find((target) => target.type === "page");

      if (page) return page.webSocketDebuggerUrl;
    } catch {}

    await Bun.sleep(100);
  }

  throw new Error("chrome_target_timeout");
}

export async function launchChrome(url: string): Promise<Browser> {
  const binary =
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), "echo-chrome-"));

  const chrome = Bun.spawn(
    [
      binary,
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-default-apps",
      url,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  const socket = new WebSocket(await waitForTarget(port));

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("cdp_socket_failed")), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, (reply: z.infer<typeof cdpReply>) => void>();

  socket.addEventListener("message", (event) => {
    const reply = cdpReply.safeParse(JSON.parse(String(event.data)));

    if (reply.success && reply.data.id) pending.get(reply.data.id)?.(reply.data);
  });

  async function cdp(method: string, params: JsonObject = {}): Promise<JsonObject> {
    const id = ++nextId;
    const reply = new Promise<z.infer<typeof cdpReply>>((resolve) => pending.set(id, resolve));

    socket.send(JSON.stringify({ id, method, params }));
    const message = await reply;

    pending.delete(id);

    if (message.error) throw new Error(JSON.stringify(message.error));

    return message.result ?? {};
  }

  async function evaluate<T>(
    expression: string,
    schema: z.ZodType<T>,
    awaitPromise = true,
  ): Promise<T> {
    const reply = remoteObject.parse(
      await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true }),
    );

    if (!("value" in reply.result))
      throw new Error(reply.result.description ?? "evaluation_failed");

    return schema.parse(reply.result.value);
  }

  async function close(): Promise<void> {
    socket.close();
    chrome.kill();
    await chrome.exited;
    await rm(profile, { recursive: true, force: true });
  }

  return { cdp, evaluate, run: (expression) => evaluate(expression, json), close };
}

export async function callTool(
  endpoint: string,
  id: number,
  name: string,
  args: JsonObject,
): Promise<JsonObject> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  const body = toolReply.parse(await response.json());

  return (
    body.result?.structuredContent ?? {
      ok: false,
      error: JSON.stringify(body.error ?? null),
      http: response.status,
    }
  );
}

const capabilityReply = z.object({
  result: z
    .object({
      structuredContent: z
        .object({
          ok: z.boolean().optional(),
          error: z.string().optional(),
          result: json.optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

export type CapabilityOutcome = { ok?: boolean; error?: string; result?: Json };

export async function callCapability(
  endpoint: string,
  id: number,
  name: string,
  input: Json,
  operationId?: string,
): Promise<CapabilityOutcome> {
  const args: JsonObject = operationId ? { name, input, operationId } : { name, input };

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

  return capabilityReply.parse(await response.json()).result?.structuredContent ?? {};
}

export async function waitFor(browser: Browser, expression: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if (await browser.run(expression)) return;
    } catch {}

    await Bun.sleep(100);
  }

  throw new Error(`wait_failed:${expression}`);
}
