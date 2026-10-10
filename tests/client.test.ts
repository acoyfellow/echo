import { describe, expect, test } from "bun:test";
import { createEcho, type EchoCapability } from "../client";

class FakeSocket {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();
  closed = false;

  addEventListener(type: string, listener: (event: MessageEvent | Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.emit("close", new Event("close"));
  }

  send(value: string): void {
    this.sent.push(value);
  }

  emit(type: string, event: MessageEvent | Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function setup(capability?: EchoCapability) {
  const socket = new FakeSocket();
  const fetcher = async () => Response.json({
    id: "session123",
    mcpToken: "mcp-token",
    pageToken: "page-token",
    expiresAt: 9999999999,
  });
  const client = createEcho({
    workerBase: "https://echo.example",
    appId: "notes",
    origin: "https://notes.example",
    fetch: fetcher,
    createSocket: () => {
      queueMicrotask(() => socket.emit("open", new Event("open")));
      return socket;
    },
  });
  client.register({
    changeDraft: capability ?? {
      description: "Change the draft",
      effect: "mutation",
      inputSchema: { type: "object" },
      run: async (input) => input,
    },
  });
  return { client, socket };
}

async function deliver(socket: FakeSocket, message: unknown): Promise<Record<string, unknown>> {
  socket.emit("message", new MessageEvent("message", { data: JSON.stringify(message) }));
  await Bun.sleep(0);
  return JSON.parse(socket.sent.at(-1) ?? "{}") as Record<string, unknown>;
}

describe("extension-free page client", () => {
  test("connects with a page credential and lists only registered capabilities", async () => {
    const { client, socket } = setup();
    const session = await client.connect();
    expect(session.mcpUrl).toContain("mcp-token");
    const reply = await deliver(socket, { type: "capability_list", callId: "list-1" });
    expect(reply).toEqual({
      type: "result",
      callId: "list-1",
      result: {
        ok: true,
        result: {
          appId: "notes",
          origin: "https://notes.example",
          capabilities: [{
            name: "changeDraft",
            description: "Change the draft",
            inputSchema: { type: "object" },
            effect: "mutation",
          }],
        },
      },
    });
  });

  test("requires an operation identity for mutations", async () => {
    const { client, socket } = setup();
    await client.connect();
    const reply = await deliver(socket, { type: "capability_call", callId: "call-1", name: "changeDraft", input: { text: "hello" } });
    expect(reply.result).toEqual({ ok: false, error: "operation_id_required" });
  });

  test("executes a granted mutation and refuses an unknown capability", async () => {
    const { client, socket } = setup();
    await client.connect();
    const success = await deliver(socket, { type: "capability_call", callId: "call-1", name: "changeDraft", operationId: "op-1", input: { text: "hello" } });
    expect(success.result).toEqual({ ok: true, result: { text: "hello" } });
    const denied = await deliver(socket, { type: "capability_call", callId: "call-2", name: "stopEcho", operationId: "op-2", input: {} });
    expect(denied.result).toEqual({ ok: false, error: "capability_not_granted" });
  });

  test("stops the page connection immediately", async () => {
    const { client, socket } = setup();
    await client.connect();
    client.stop();
    expect(socket.closed).toBe(true);
  });
});
