import { Agent, type Connection, type ConnectionContext, unstable_callable } from "agents";
import { verifyCapability, type CapabilityGrant } from "./auth";
import type { Env, WebMcpResult } from "./types";

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
  operations: Record<string, OperationReceipt>;
};

type PendingCall = {
  connection: Connection;
  resolve: (result: WebMcpResult) => void;
};

export class EchoAgent extends Agent<Env, SessionState> {
  initialState: SessionState = { origin: "", appId: "", grants: [], expiresAt: 0, revoked: false, operations: {} };
  #pending = new Map<string, PendingCall>();

  async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    const url = new URL(context.request.url);
    const origin = url.searchParams.get("origin");
    const expiresAt = Number(url.searchParams.get("expiresAt"));
    const appId = url.searchParams.get("appId");
    let grants: CapabilityGrant[];
    try { grants = JSON.parse(url.searchParams.get("grants") ?? "[]") as CapabilityGrant[]; }
    catch { connection.close(4001, "binding_required"); return; }
    if (!origin || !appId || !Number.isFinite(expiresAt)) { connection.close(4001, "binding_required"); return; }
    if (this.state.revoked || expiresAt * 1000 <= Date.now()) { connection.close(4003, "session_revoked"); return; }
    if (this.state.origin && (this.state.origin !== origin || this.state.expiresAt !== expiresAt || this.state.appId !== appId || JSON.stringify(this.state.grants) !== JSON.stringify(grants))) { connection.close(4002, "binding_mismatch"); return; }
    const existing = [...this.getConnections()].find((candidate) => candidate !== connection && candidate.readyState === 1);
    if (existing) { connection.close(4004, "page_already_connected"); return; }
    if (!this.state.origin) this.setState({ origin, appId, grants, expiresAt, revoked: false, operations: {} });
    this.setConnectionReadonly(connection, true);
  }

  async onMessage(connection: Connection, raw: string | ArrayBuffer): Promise<void> {
    if ((typeof raw === "string" && raw.length > 262144) || (raw instanceof ArrayBuffer && raw.byteLength > 262144)) {
      connection.close(4009, "result_too_large");
      return;
    }
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (new TextEncoder().encode(text).byteLength > 262144) {
      connection.close(4009, "result_too_large");
      return;
    }
    let message: { type?: string; callId?: string; result?: WebMcpResult };
    try { message = JSON.parse(text); } catch { return; }
    if (message.type !== "result" || typeof message.callId !== "string") return;
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
    const anotherConnectionIsOpen = [...this.getConnections()].some((candidate) => candidate !== connection && candidate.readyState === 1);
    if (!anotherConnectionIsOpen && !this.state.revoked) {
      const operations = { ...this.state.operations };
      for (const [operationId, receipt] of Object.entries(operations)) {
        if (receipt.status === "dispatched") operations[operationId] = { ...receipt, status: "outcome_unknown" };
      }
      this.setState({ ...this.state, revoked: true, operations });
    }
  }

  async #workerAuthorizationError(token: string): Promise<string | null> {
    const verified = await verifyCapability(this.env.ECHO_SIGNING_SECRET, token, "worker");
    if (!verified) return "worker_token_invalid";
    if (verified.id !== this.name) return "worker_session_mismatch";
    return null;
  }

  async #requestTab(token: string, message: Record<string, unknown>, timeoutMs = 30_000): Promise<WebMcpResult> {
    const authorizationError = await this.#workerAuthorizationError(token);
    if (authorizationError) return { ok: false, error: authorizationError };
    if (this.state.revoked || this.state.expiresAt * 1000 <= Date.now()) return { ok: false, error: "session_revoked" };
    if (!this.state.origin) return { ok: false, error: "session_unbound" };
    if (this.#pending.size > 0) return { ok: false, error: "session_busy" };
    const connection = [...this.getConnections()].find((candidate) => candidate.readyState === 1);
    if (!connection) return { ok: false, error: "session_closed" };
    const callId = crypto.randomUUID();
    const pending = new Promise<WebMcpResult>((resolve) => this.#pending.set(callId, { connection, resolve }));
    connection.send(JSON.stringify({ ...message, callId, timeoutMs }));
    return Promise.race([
      pending,
      new Promise<WebMcpResult>((resolve) => setTimeout(() => {
        if (!this.#pending.delete(callId)) return;
        this.setState({ ...this.state, revoked: true });
        connection.close(4010, "request_timeout");
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs + 1000)),
    ]);
  }

  @unstable_callable({ description: "List capabilities in the bound tab." })
  async listCapabilities(workerToken: string): Promise<WebMcpResult> {
    return this.#requestTab(workerToken, { type: "capability_list" });
  }

  @unstable_callable({ description: "Call one capability in the bound tab." })
  async callCapability(workerToken: string, name: string, input: unknown, operationId?: string): Promise<WebMcpResult> {
    const grant = this.state.grants.find((candidate) => candidate.name === name);
    if (!grant) return { ok: false, error: "capability_not_granted" };
    if (grant.effect === "mutation" && !operationId) return { ok: false, error: "operation_id_required" };
    if (operationId) {
      const existing = this.state.operations[operationId];
      if (existing) {
        if (existing.capability !== name) return { ok: false, error: "operation_id_conflict" };
        if (existing.status === "dispatched" || existing.status === "outcome_unknown") return { ok: false, error: "outcome_unknown" };
        return existing.result ?? { ok: false, error: "receipt_missing_result" };
      }
      this.setState({
        ...this.state,
        operations: { ...this.state.operations, [operationId]: { operationId, capability: name, status: "dispatched" } },
      });
    }
    const result = await this.#requestTab(workerToken, {
      type: "capability_call",
      name,
      input,
      operationId,
    });
    if (operationId) {
      const status = result.error === "session_closed" || result.error === "timeout" || result.error === "outcome_unknown" ? "outcome_unknown" : result.ok ? "completed" : "failed";
      this.setState({
        ...this.state,
        operations: { ...this.state.operations, [operationId]: { operationId, capability: name, status, result } },
      });
    }
    return result;
  }

}
