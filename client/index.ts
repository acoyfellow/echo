export type EchoEffect = "read" | "mutation";

export type EchoCapability<Input = unknown, Output = unknown> = {
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  effect: EchoEffect;
  run(input: Input, context: { operationId?: string; signal: AbortSignal }): Promise<Output> | Output;
};

export type EchoCapabilities = Record<string, EchoCapability>;

type MintedSession = {
  id: string;
  mcpToken: string;
  pageToken: string;
  expiresAt: number;
};

type EchoSocket = {
  addEventListener(type: string, listener: (event: MessageEvent | Event) => void): void;
  close(): void;
  send(value: string): void;
};

type EchoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type EchoClientOptions = {
  workerBase: string;
  appId: string;
  origin?: string;
  fetch?: EchoFetch;
  createSocket?: (url: string) => EchoSocket;
  onActivity?: (activity: { capability: string; effect: EchoEffect; operationId?: string; status: "started" | "finished" | "failed" }) => void;
};

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
}

function socketUrl(workerBase: string, id: string, origin: string, token: string, appId: string): string {
  const url = new URL(`/agents/echo-agent/${id}`, workerBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("origin", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("appId", appId);
  url.searchParams.set("transport", "page");
  return url.toString();
}

export class EchoClient {
  readonly #options: EchoClientOptions;
  readonly #capabilities = new Map<string, EchoCapability>();
  #socket: EchoSocket | null = null;
  #session: MintedSession | null = null;

  constructor(options: EchoClientOptions) {
    this.#options = options;
  }

  register(capabilities: EchoCapabilities): void {
    if (this.#socket) throw new Error("session_active");
    for (const [name, capability] of Object.entries(capabilities)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(name)) throw new Error("capability_name_invalid");
      if (this.#capabilities.has(name)) throw new Error("capability_already_registered");
      this.#capabilities.set(name, capability);
    }
  }

  describe(): Array<{ name: string; description: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; effect: EchoEffect }> {
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
    const origin = this.#options.origin ?? globalThis.location.origin;
    const fetcher = this.#options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${this.#options.workerBase.replace(/\/$/, "")}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin, appId: this.#options.appId, capabilities: this.describe() }),
    });
    if (!response.ok) throw new Error(`session_mint_failed_${response.status}`);
    const session = await response.json() as MintedSession;
    const createSocket = this.#options.createSocket ?? ((url) => new WebSocket(url));
    const socket = createSocket(socketUrl(this.#options.workerBase, session.id, origin, session.pageToken, this.#options.appId));
    this.#session = session;
    this.#socket = socket;
    socket.addEventListener("message", (event) => void this.#onMessage(event as MessageEvent));
    socket.addEventListener("close", () => {
      if (this.#socket === socket) this.#socket = null;
    });
    return {
      sessionId: session.id,
      mcpUrl: `${this.#options.workerBase.replace(/\/$/, "")}/mcp?id=${encodeURIComponent(session.mcpToken)}`,
      expiresAt: session.expiresAt,
    };
  }

  stop(): void {
    const socket = this.#socket;
    this.#socket = null;
    this.#session = null;
    socket?.close();
  }

  async #onMessage(event: MessageEvent): Promise<void> {
    let message: { type?: string; callId?: string; name?: string; input?: unknown; operationId?: string; timeoutMs?: number };
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (!message.callId) return;
    if (message.type === "capability_list") {
      this.#send(message.callId, { ok: true, result: { appId: this.#options.appId, origin: this.#options.origin ?? globalThis.location.origin, capabilities: this.describe() } });
      return;
    }
    const capability = message.name ? this.#capabilities.get(message.name) : undefined;
    if (message.type !== "capability_call" || !message.name || !capability) {
      this.#send(message.callId, { ok: false, error: "capability_not_granted" });
      return;
    }
    if (capability.effect === "mutation" && !message.operationId) {
      this.#send(message.callId, { ok: false, error: "operation_id_required" });
      return;
    }
    if (bytes(message.input) > 65_536) {
      this.#send(message.callId, { ok: false, error: "capability_input_too_large" });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(message.timeoutMs ?? 20_000, 20_000));
    this.#options.onActivity?.({ capability: message.name, effect: capability.effect, operationId: message.operationId, status: "started" });
    try {
      const result = await capability.run(message.input, { operationId: message.operationId, signal: controller.signal });
      if (bytes(result) > 262_144) this.#send(message.callId, { ok: false, error: "capability_result_too_large" });
      else this.#send(message.callId, { ok: true, result });
      this.#options.onActivity?.({ capability: message.name, effect: capability.effect, operationId: message.operationId, status: "finished" });
    } catch {
      this.#send(message.callId, { ok: false, error: controller.signal.aborted ? "capability_timeout" : "capability_execution_failed" });
      this.#options.onActivity?.({ capability: message.name, effect: capability.effect, operationId: message.operationId, status: "failed" });
    } finally {
      clearTimeout(timeout);
    }
  }

  #send(callId: string, result: unknown): void {
    this.#socket?.send(JSON.stringify({ type: "result", callId, result }));
  }
}

export function createEcho(options: EchoClientOptions): EchoClient {
  return new EchoClient(options);
}
