/**
 * EchoAgent — the supervisor.
 *
 * One Agent (DO) per signed session. Owns:
 *   - the WebSocket to the extension
 *   - the pinned origin
 *   - the set of plan ids spawned this session
 *
 * It does NOT own the plan code. That goes into a workflow + a Worker
 * Loader sandbox addressed by the workflow.
 *
 * The agent exposes one public method that the workflow calls back into:
 * `invokeTab(verb, args)`. The workflow makes each call durable by
 * wrapping it in `step.do`; the agent does not have to know that.
 */

import { Agent, type Connection, type ConnectionContext, unstable_callable } from "agents";
import type { Env, Verb, PlanParams } from "./types";
import { preflight } from "./preflight";

export type SessionState = {
  origin: string;
  planIds: string[];
};

export class EchoAgent extends Agent<Env, SessionState> {
  initialState: SessionState = { origin: "", planIds: [] };

  // Pending in-flight tab calls keyed by callId.
  #pending = new Map<string, (r: unknown) => void>();

  // ─── WebSocket lifecycle ───────────────────────────────────────────────

  async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const origin = url.searchParams.get("origin");
    if (!origin) {
      conn.close(4001, "origin_required");
      return;
    }
    if (this.state.origin && this.state.origin !== origin) {
      conn.close(4002, "origin_mismatch");
      return;
    }
    if (!this.state.origin) {
      this.setState({ ...this.state, origin });
    }
  }

  async onMessage(conn: Connection, raw: string | ArrayBuffer): Promise<void> {
    const str = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let msg: { type?: string; callId?: string; result?: unknown };
    try { msg = JSON.parse(str); } catch { return; }
    if (msg.type === "result" && typeof msg.callId === "string") {
      const resolver = this.#pending.get(msg.callId);
      if (resolver) {
        this.#pending.delete(msg.callId);
        resolver(msg.result);
      }
    }
  }

  async onClose(_conn: Connection): Promise<void> {
    for (const [, resolve] of this.#pending) resolve({ error: "session_closed" });
    this.#pending.clear();
  }

  // ─── Public RPC: workflow → agent → tab ────────────────────────────────

  /**
   * Send a verb to the tab, await response.
   *
   * Called by the workflow inside a step.do. The workflow caches the
   * result in step history; on replay, the workflow won't re-call us.
   *
   * `@unstable_callable` marks this as RPC-reachable from sub-agents
   * (via `this.parentAgent()`).
   */
  @unstable_callable({ description: "Send a verb to the tab and await response." })
  async invokeTab(verb: Verb, args: unknown): Promise<unknown> {
    const rejection = preflight(verb, args, this.state.origin || null);
    if (rejection) return rejection;

    const conn = [...this.getConnections()].find((c) => c.readyState === 1);
    if (!conn) return { error: "session_closed" };

    const callId = crypto.randomUUID();
    const p = new Promise<unknown>((r) => this.#pending.set(callId, r));
    conn.send(JSON.stringify({ type: "call", callId, verb, args }));

    const timeoutMs = verb === "ask" ? 5 * 60_000 : 30_000;
    return await Promise.race([
      p,
      new Promise<unknown>((r) =>
        setTimeout(() => {
          this.#pending.delete(callId);
          r({ error: "timeout" });
        }, timeoutMs),
      ),
    ]);
  }

  /**
   * Agent submits a plan. We create a workflow whose `run` will load the
   * plan into a Worker Loader sandbox and execute it.
   *
   * Returns immediately with the planId; the workflow runs in the
   * background. The agent polls `status(planId)` for progress.
   */
  @unstable_callable({ description: "Submit a TypeScript plan to run against the tab." })
  async run(planSource: string): Promise<{ planId: string }> {
    if (planSource.length > Number(this.env.ECHO_MAX_PLAN_BYTES || "65536")) {
      throw new Error("plan_too_large");
    }
    const params: PlanParams = {
      planSource,
      sessionId: this.name,
      origin: this.state.origin,
    };
    // AgentWorkflow MUST be started via this.runWorkflow(); the helper
    // injects __agentName, __agentBinding, __workflowName so the workflow
    // can RPC back to us. See node_modules/agents/dist/agent-tool-types-*.d.ts.
    const planId = await this.runWorkflow("PLAN" as never, params);
    this.setState({ ...this.state, planIds: [...this.state.planIds, planId] });
    return { planId };
  }

  /**
   * Workflow status + step history. Step history *is* the receipt chain.
   */
  @unstable_callable({ description: "Get plan workflow status + step log." })
  async status(planId: string): Promise<unknown> {
    if (!this.state.planIds.includes(planId)) return { error: "unknown_plan" };
    // env.PLAN is the WorkflowEntrypoint binding; .get() returns an instance.
    const inst = await this.env.PLAN.get(planId);
    return { planId, status: await inst.status() };
  }
}
