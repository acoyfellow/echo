import { Agent, type Connection, type ConnectionContext, callable } from "agents";
import { verifyCapability, type CapabilityGrant } from "./auth";
import type { CodemodeCall } from "./codemode-source";
import { capabilityGrants, pageMessage, parseJson, type Json } from "./schema";
import type { Env, WebMcpResult } from "./types";

type TabRequest =
  | { type: "capability_list" }
  | { type: "capability_call"; name: string; input: Json; operationId?: string };

type OperationLedger = Map<string, OperationReceipt>;

export type OperationReceipt = {
  operationId: string;
  capability: string;
  status: "dispatched" | "completed" | "failed" | "outcome_unknown";
  result?: WebMcpResult;
};

export type SessionState = {
  origin: string;
  appId: string;
  grants: CapabilityGrant[];
  expiresAt: number;
  revoked: boolean;
  operations: { [operationId: string]: OperationReceipt };
};

type PendingCall = {
  connection: Connection;
  resolve: (result: WebMcpResult) => void;
};

const MAX_WAITING_CALLS = 16;

export class EchoAgent extends Agent<Env, SessionState> {
  initialState: SessionState = {
    origin: "",
    appId: "",
    grants: [],
    expiresAt: 0,
    revoked: false,
    operations: {},
  };
  #pending = new Map<string, PendingCall>();
  #queue: Promise<void> = Promise.resolve();
  #waiting = 0;

  async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    const url = new URL(context.request.url);
    const origin = url.searchParams.get("origin");
    const expiresAt = Number(url.searchParams.get("expiresAt"));
    const appId = url.searchParams.get("appId");

    const grantsParse = capabilityGrants.safeParse(
      parseJson(url.searchParams.get("grants") ?? "[]"),
    );

    if (!grantsParse.success) {
      connection.close(4001, "binding_required");

      return;
    }

    const grants: CapabilityGrant[] = grantsParse.data;

    if (!origin || !appId || !Number.isFinite(expiresAt)) {
      connection.close(4001, "binding_required");

      return;
    }

    if (this.state.revoked || expiresAt * 1000 <= Date.now()) {
      connection.close(4003, "session_revoked");

      return;
    }

    if (
      this.state.origin &&
      (this.state.origin !== origin ||
        this.state.expiresAt !== expiresAt ||
        this.state.appId !== appId ||
        JSON.stringify(this.state.grants) !== JSON.stringify(grants))
    ) {
      connection.close(4002, "binding_mismatch");

      return;
    }

    const existing = [...this.getConnections()].find(
      (candidate) => candidate !== connection && candidate.readyState === 1,
    );

    if (existing) {
      connection.close(4004, "page_already_connected");

      return;
    }

    if (!this.state.origin)
      this.setState({ origin, appId, grants, expiresAt, revoked: false, operations: {} });
    this.setConnectionReadonly(connection, true);
  }

  async onMessage(connection: Connection, raw: string | ArrayBuffer): Promise<void> {
    const text = raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : raw;

    if (new TextEncoder().encode(text).byteLength > 262144) {
      connection.close(4009, "result_too_large");

      return;
    }

    const parsed = pageMessage.safeParse(parseJson(text));

    if (!parsed.success) return;
    const message = parsed.data;
    const pending = this.#pending.get(message.callId);

    if (!pending || pending.connection !== connection) return;
    this.#pending.delete(message.callId);
    pending.resolve(message.result ?? { ok: false, error: "empty_result" });
  }

  async onClose(connection: Connection): Promise<void> {
    for (const [callId, pending] of this.#pending) {
      if (pending.connection !== connection) continue;
      this.#pending.delete(callId);
      pending.resolve({ ok: false, error: "session_closed" });
    }

    const anotherConnectionIsOpen = [...this.getConnections()].some(
      (candidate) => candidate !== connection && candidate.readyState === 1,
    );

    if (!anotherConnectionIsOpen && !this.state.revoked) {
      const operations: OperationLedger = new Map(Object.entries(this.state.operations));

      for (const [operationId, receipt] of operations) {
        if (receipt.status === "dispatched")
          operations.set(operationId, { ...receipt, status: "outcome_unknown" });
      }

      this.setState({ ...this.state, revoked: true, operations: Object.fromEntries(operations) });
    }
  }

  async #workerAuthorizationError(token: string): Promise<string | null> {
    const verified = await verifyCapability(this.env.ECHO_SIGNING_SECRET, token, "worker");

    if (!verified) return "worker_token_invalid";

    if (verified.id !== this.name) return "worker_session_mismatch";

    return null;
  }

  async #requestTab(token: string, message: TabRequest, timeoutMs = 30_000): Promise<WebMcpResult> {
    const authorizationError = await this.#workerAuthorizationError(token);

    if (authorizationError) return { ok: false, error: authorizationError };

    if (this.state.revoked || this.state.expiresAt * 1000 <= Date.now())
      return { ok: false, error: "session_revoked" };

    if (!this.state.origin) return { ok: false, error: "session_unbound" };

    if (this.#waiting >= MAX_WAITING_CALLS) return { ok: false, error: "session_busy" };
    this.#waiting += 1;
    const turn = this.#queue.then(() => this.#sendToTab(message, timeoutMs));

    this.#queue = turn.then(
      () => undefined,
      () => undefined,
    );

    try {
      return await turn;
    } finally {
      this.#waiting -= 1;
    }
  }

  async #sendToTab(message: TabRequest, timeoutMs: number): Promise<WebMcpResult> {
    if (this.state.revoked) return { ok: false, error: "session_revoked" };
    const connection = [...this.getConnections()].find((candidate) => candidate.readyState === 1);

    if (!connection) return { ok: false, error: "session_closed" };
    const callId = crypto.randomUUID();

    const pending = new Promise<WebMcpResult>((resolve) =>
      this.#pending.set(callId, { connection, resolve }),
    );

    connection.send(JSON.stringify({ ...message, callId, timeoutMs }));

    return Promise.race([
      pending,
      new Promise<WebMcpResult>((resolve) =>
        setTimeout(() => {
          if (!this.#pending.delete(callId)) return;
          this.setState({ ...this.state, revoked: true });
          connection.close(4010, "request_timeout");
          resolve({ ok: false, error: "timeout" });
        }, timeoutMs + 1000),
      ),
    ]);
  }

  @callable({ description: "List capabilities in the bound tab." })
  async listCapabilities(workerToken: string): Promise<string> {
    return JSON.stringify(await this.#requestTab(workerToken, { type: "capability_list" }));
  }

  @callable({ description: "List the capability calls recorded under one operation prefix." })
  async listOperations(workerToken: string, prefix: string): Promise<CodemodeCall[]> {
    if (await this.#workerAuthorizationError(workerToken)) return [];

    return Object.values(this.state.operations)
      .filter((receipt) => receipt.operationId.startsWith(`${prefix}:`))
      .sort(
        (left, right) =>
          Number(left.operationId.slice(prefix.length + 1)) -
          Number(right.operationId.slice(prefix.length + 1)),
      )
      .map((receipt) => ({
        capability: receipt.capability,
        operationId: receipt.operationId,
        ok: receipt.result?.ok ?? false,
        error:
          receipt.result?.error ?? (receipt.status === "completed" ? undefined : receipt.status),
      }));
  }

  @callable({ description: "Call one capability in the bound tab." })
  async callCapability(
    workerToken: string,
    name: string,
    inputText: string,
    operationId?: string,
  ): Promise<string> {
    return JSON.stringify(await this.#callCapability(workerToken, name, inputText, operationId));
  }

  async #callCapability(
    workerToken: string,
    name: string,
    inputText: string,
    operationId?: string,
  ): Promise<WebMcpResult> {
    const input = parseJson(inputText);

    if (input === undefined) return { ok: false, error: "capability_input_invalid" };

    const grant = this.state.grants.find((candidate) => candidate.name === name);

    if (!grant) return { ok: false, error: "capability_not_granted" };

    if (grant.effect === "mutation" && !operationId)
      return { ok: false, error: "operation_id_required" };

    if (operationId) {
      const existing = this.state.operations[operationId];

      if (existing) {
        if (existing.capability !== name) return { ok: false, error: "operation_id_conflict" };

        if (existing.status === "dispatched" || existing.status === "outcome_unknown")
          return { ok: false, error: "outcome_unknown" };

        return existing.result ?? { ok: false, error: "receipt_missing_result" };
      }

      this.setState({
        ...this.state,
        operations: {
          ...this.state.operations,
          [operationId]: { operationId, capability: name, status: "dispatched" },
        },
      });
    }

    const result = await this.#requestTab(workerToken, {
      type: "capability_call",
      name,
      input,
      operationId,
    });

    if (operationId) {
      const status =
        result.error === "session_closed" ||
        result.error === "timeout" ||
        result.error === "outcome_unknown"
          ? "outcome_unknown"
          : result.ok
            ? "completed"
            : "failed";

      this.setState({
        ...this.state,
        operations: {
          ...this.state.operations,
          [operationId]: { operationId, capability: name, status, result },
        },
      });
    }

    return result;
  }
}
