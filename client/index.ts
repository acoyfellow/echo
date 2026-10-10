import { z } from "zod";
import { json, type Json } from "../src/schema";

export type { Json };

export type EchoEffect = "read" | "mutation";

export type JsonSchema = { [keyword: string]: Json };

export type EchoCapabilityContext = { operationId?: string; signal: AbortSignal };

export type EchoCapability = {
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  effect: EchoEffect;
  run(input: Json, context: EchoCapabilityContext): Promise<Json> | Json;
};

export type EchoCapabilities = { [name: string]: EchoCapability };

export type EchoActivity = {
  capability: string;
  effect: EchoEffect;
  operationId?: string;
  status: "started" | "finished" | "failed";
};

export type EchoCapabilityDescription = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  effect: EchoEffect;
};

type EchoSocket = {
  addEventListener(type: "message", listener: (event: { data: string }) => void): void;
  addEventListener(type: "open" | "error" | "close", listener: () => void): void;
  close(): void;
  send(value: string): void;
};

type EchoFetch = (input: string, init: RequestInit) => Promise<Response>;

export type EchoClientOptions = {
  workerBase: string;
  appId: string;
  origin?: string;
  fetch?: EchoFetch;
  createSocket?: (url: string) => EchoSocket;
  onActivity?: (activity: EchoActivity) => void;
};

type CallResult = { ok: true; result: Json } | { ok: false; error: string };

const mintedSession = z.object({
  id: z.string(),
  mcpToken: z.string(),
  pageToken: z.string(),
  expiresAt: z.number(),
});

const tabRequest = z.object({
  type: z.enum(["capability_list", "capability_call"]),
  callId: z.string().min(1),
  name: z.string().optional(),
  input: json.optional(),
  operationId: z.string().optional(),
  timeoutMs: z.number().optional(),
});

type TabRequest = z.infer<typeof tabRequest>;

function bytes(value: Json): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function parseTabRequest(data: string): TabRequest | undefined {
  try {
    const parsed = tabRequest.safeParse(JSON.parse(data));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function socketUrl(
  workerBase: string,
  id: string,
  origin: string,
  token: string,
  appId: string,
): string {
  const url = new URL(`/agents/echo-agent/${id}`, workerBase);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("origin", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("appId", appId);
  url.searchParams.set("transport", "page");

  return url.toString();
}

function browserSocket(url: string): EchoSocket {
  const socket = new WebSocket(url);

  return {
    addEventListener(type: string, listener: (event: { data: string }) => void) {
      socket.addEventListener(type, (event) => {
        listener({ data: event instanceof MessageEvent ? String(event.data) : "" });
      });
    },
    close: () => socket.close(),
    send: (value) => socket.send(value),
  };
}

export class EchoClient {
  readonly #options: EchoClientOptions;
  readonly #capabilities = new Map<string, EchoCapability>();
  #socket: EchoSocket | null = null;

  constructor(options: EchoClientOptions) {
    this.#options = options;
  }

  get #origin(): string {
    return this.#options.origin ?? globalThis.location.origin;
  }

  get #base(): string {
    return this.#options.workerBase.replace(/\/$/, "");
  }

  register(capabilities: EchoCapabilities): void {
    if (this.#socket) throw new Error("session_active");

    for (const [name, capability] of Object.entries(capabilities)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(name)) throw new Error("capability_name_invalid");

      if (this.#capabilities.has(name)) throw new Error("capability_already_registered");
      this.#capabilities.set(name, capability);
    }
  }

  describe(): EchoCapabilityDescription[] {
    return [...this.#capabilities].map(([name, capability]) => ({
      name,
      description: capability.description,
      inputSchema: capability.inputSchema,
      outputSchema: capability.outputSchema,
      effect: capability.effect,
    }));
  }

  async connect(): Promise<{ sessionId: string; mcpUrl: string; expiresAt: number }> {
    if (this.#socket) throw new Error("session_active");

    if (this.#capabilities.size === 0) throw new Error("capabilities_required");
    const fetcher: EchoFetch = this.#options.fetch ?? ((input, init) => fetch(input, init));

    const response = await fetcher(`${this.#base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origin: this.#origin,
        appId: this.#options.appId,
        capabilities: this.describe(),
      }),
    });

    if (!response.ok) throw new Error(`session_mint_failed_${response.status}`);
    const parsed = mintedSession.safeParse(await response.json());

    if (!parsed.success) throw new Error("session_mint_invalid");
    const session = parsed.data;
    const createSocket = this.#options.createSocket ?? browserSocket;

    const socket = createSocket(
      socketUrl(
        this.#options.workerBase,
        session.id,
        this.#origin,
        session.pageToken,
        this.#options.appId,
      ),
    );

    this.#socket = socket;
    socket.addEventListener("message", (event) => void this.#onMessage(event.data));

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("page_connection_timeout")), 10_000);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("page_connection_failed"));
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(new Error("page_connection_closed"));
      });
    }).catch((error: Error) => {
      if (this.#socket === socket) this.#socket = null;
      socket.close();
      throw error;
    });

    socket.addEventListener("close", () => {
      if (this.#socket === socket) this.#socket = null;
    });

    return {
      sessionId: session.id,
      mcpUrl: `${this.#base}/mcp?id=${encodeURIComponent(session.mcpToken)}`,
      expiresAt: session.expiresAt,
    };
  }

  stop(): void {
    const socket = this.#socket;

    this.#socket = null;
    socket?.close();
  }

  async #onMessage(data: string): Promise<void> {
    const message = parseTabRequest(data);

    if (!message) return;

    if (message.type === "capability_list") {
      this.#send(message.callId, {
        ok: true,
        result: { appId: this.#options.appId, origin: this.#origin, capabilities: this.describe() },
      });

      return;
    }

    const capability = message.name ? this.#capabilities.get(message.name) : undefined;

    if (!message.name || !capability) {
      this.#send(message.callId, { ok: false, error: "capability_not_granted" });

      return;
    }

    if (capability.effect === "mutation" && !message.operationId) {
      this.#send(message.callId, { ok: false, error: "operation_id_required" });

      return;
    }

    const input = message.input ?? null;

    if (bytes(input) > 65_536) {
      this.#send(message.callId, { ok: false, error: "capability_input_too_large" });

      return;
    }

    await this.#run(message.callId, message.name, capability, input, message);
  }

  async #run(
    callId: string,
    name: string,
    capability: EchoCapability,
    input: Json,
    message: TabRequest,
  ): Promise<void> {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(message.timeoutMs ?? 20_000, 20_000),
    );

    const report = (status: EchoActivity["status"]) =>
      this.#options.onActivity?.({
        capability: name,
        effect: capability.effect,
        operationId: message.operationId,
        status,
      });

    report("started");

    try {
      const result = await capability.run(input, {
        operationId: message.operationId,
        signal: controller.signal,
      });

      this.#send(
        callId,
        bytes(result) > 262_144
          ? { ok: false, error: "capability_result_too_large" }
          : { ok: true, result },
      );
      report("finished");
    } catch {
      this.#send(callId, {
        ok: false,
        error: controller.signal.aborted ? "capability_timeout" : "capability_execution_failed",
      });
      report("failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  #send(callId: string, result: CallResult): void {
    this.#socket?.send(JSON.stringify({ type: "result", callId, result }));
  }
}

export function createEcho(options: EchoClientOptions): EchoClient {
  return new EchoClient(options);
}
