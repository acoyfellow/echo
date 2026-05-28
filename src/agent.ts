/**
 * EchoAgent — the supervisor.
 *
 * One Agent (DO) per signed session. Owns:
 *   - the WebSocket to the extension
 *   - the pinned origin
 *   - the set of plan ids spawned this session
 *
 * The agent exposes one public RPC the workflow uses:
 *   invokeTab(code, timeoutMs) → ExecuteResult
 *
 * The agent does NOT eval code. The content script does. The agent is
 * just the WS bridge between the workflow's facet (which holds the plan)
 * and the tab (which runs the code).
 */

import { Agent, type Connection, type ConnectionContext, unstable_callable } from "agents";
import type { Env, ExecuteArgs, ExecuteResult, PlanParams } from "./types";
import { preflightExecute } from "./preflight";

async function sha8(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash).slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SessionState = {
  origin: string;
  planIds: string[];
};

export class EchoAgent extends Agent<Env, SessionState> {
  initialState: SessionState = { origin: "", planIds: [] };

  #pending = new Map<string, (r: ExecuteResult) => void>();

  // ─── WebSocket lifecycle ───────────────────────────────────────────────

  async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const origin = url.searchParams.get("origin");
    if (!origin) { conn.close(4001, "origin_required"); return; }
    if (this.state.origin && this.state.origin !== origin) {
      conn.close(4002, "origin_mismatch");
      return;
    }
    if (!this.state.origin) this.setState({ ...this.state, origin });
  }

  async onMessage(_conn: Connection, raw: string | ArrayBuffer): Promise<void> {
    const str = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let msg: { type?: string; callId?: string; result?: ExecuteResult };
    try { msg = JSON.parse(str); } catch { return; }
    if (msg.type === "result" && typeof msg.callId === "string") {
      const resolver = this.#pending.get(msg.callId);
      if (resolver) {
        this.#pending.delete(msg.callId);
        resolver(msg.result ?? { ok: false, error: "empty_result" });
      }
    }
  }

  async onClose(_conn: Connection): Promise<void> {
    for (const [, resolve] of this.#pending) resolve({ ok: false, error: "session_closed" });
    this.#pending.clear();
  }

  // ─── Public RPC: workflow facet → agent → tab ──────────────────────────

  @unstable_callable({ description: "Execute a code snippet in the user's tab and return the result." })
  async invokeTab(args: ExecuteArgs): Promise<ExecuteResult> {
    const rejection = preflightExecute(args, Number(this.env.ECHO_MAX_PLAN_BYTES || "65536"));
    if (rejection) return { ok: false, ...rejection };

    if (!this.state.origin) return { ok: false, error: "session_unbound" };

    const conn = [...this.getConnections()].find((c) => c.readyState === 1);
    if (!conn) return { ok: false, error: "session_closed" };

    const callId = crypto.randomUUID();
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 30_000, 5 * 60_000));

    const p = new Promise<ExecuteResult>((r) => this.#pending.set(callId, r));
    conn.send(JSON.stringify({ type: "execute", callId, code: args.code, timeoutMs }));

    return await Promise.race([
      p,
      new Promise<ExecuteResult>((r) =>
        setTimeout(() => {
          this.#pending.delete(callId);
          r({ ok: false, error: "timeout" });
        }, timeoutMs + 2000),
      ),
    ]);
  }

  // ─── Plan submission + status ──────────────────────────────────────────

  @unstable_callable({ description: "Submit a plan to run as a workflow against the tab." })
  async run(planSource: string): Promise<{ planId: string }> {
    if (planSource.length > Number(this.env.ECHO_MAX_PLAN_BYTES || "65536")) {
      throw new Error("plan_too_large");
    }
    const params: PlanParams = {
      planSource,
      sessionId: this.name,
      origin: this.state.origin,
    };
    const planId = await this.runWorkflow("PLAN" as never, params);
    this.setState({ ...this.state, planIds: [...this.state.planIds, planId] });
    return { planId };
  }

  @unstable_callable({ description: "Get plan workflow status + step log." })
  async status(planId: string): Promise<unknown> {
    if (!this.state.planIds.includes(planId)) return { error: "unknown_plan" };
    const inst = await this.env.PLAN.get(planId);
    return { planId, status: await inst.status() };
  }

  // ─── Plan facet boot + run via Worker Loader ───────────────────────────

  @unstable_callable({ description: "Boot the Worker Loader sandbox for a plan." })
  async bootPlan(planId: string, planSource: string): Promise<{ ok: boolean; error?: string }> {
    const sha = await sha8(planSource);
    const codeId = `plan-${planId}-${sha}`;
    const ctx = this.ctx as unknown as {
      exports: { TabBinding: (cfg: { props: { sessionId: string } }) => unknown };
    };

    let tabBinding: unknown;
    try { tabBinding = ctx.exports.TabBinding({ props: { sessionId: this.name } }); }
    catch (e) { return { ok: false, error: `tab_binding_export_missing: ${String(e)}` }; }

    // Wrap the plan source in a fetch-handler module. The plan source
    // must be a function expression — we name it `planFn` and call it
    // with { tab, log }.
    //
    // If the agent submits something that isn't a function expression,
    // the load will fail and we surface that error.
    const wrapped = `
export default {
  async fetch(req, env) {
    const tab = env.TAB;
    const logLines = [];
    const log = (line) => {
      const s = typeof line === "string" ? line : JSON.stringify(line);
      logLines.push(s);
      if (logLines.length > 1000) logLines.shift();
    };
    try {
      const planFn = (${planSource});
      const out = await planFn({ tab, log });
      return Response.json({ ok: true, result: out ?? null, logs: logLines });
    } catch (e) {
      return Response.json({ ok: false, error: String(e), logs: logLines }, { status: 200 });
    }
  }
};
`;

    const loader = this.env.LOADER as unknown as {
      get: (id: string, factory: () => Promise<unknown>) => Promise<unknown>;
    };

    try {
      await loader.get(codeId, async () => ({
        compatibilityDate: "2026-04-17",
        mainModule: "plan.js",
        modules: { "plan.js": wrapped },
        globalOutbound: null,
        env: { TAB: tabBinding },
        // Per desk F-5, limits.cpuMs is not enforced in `wrangler dev`.
        // Production deploys will enforce.
        limits: { cpuMs: 30_000 },
      }));
    } catch (e) {
      return { ok: false, error: `loader_get_failed: ${String(e)}` };
    }

    // Stash everything runPlan needs to rebuild the factory on cold isolates.
    await this.ctx.storage.put(`plan:${planId}`, {
      codeId,
      source: planSource,
      tabBindingSessionId: this.name,
    });
    return { ok: true };
  }

  @unstable_callable({ description: "Run the booted plan to completion." })
  async runPlan(planId: string): Promise<unknown> {
    const stored = await this.ctx.storage.get<{ codeId: string; source: string; tabBindingSessionId: string }>(`plan:${planId}`);
    if (!stored) return { ok: false, error: "plan_not_booted" };

    const ctx = this.ctx as unknown as {
      exports: { TabBinding: (cfg: { props: { sessionId: string } }) => unknown };
    };

    // Re-build the factory with the exact same source so Worker Loader can
    // rehydrate the sandbox if it was evicted between bootPlan and runPlan.
    // In prod, isolates are not guaranteed to survive across workflow steps.
    const wrapped = `
export default {
  async fetch(req, env) {
    const tab = env.TAB;
    const logLines = [];
    const log = (line) => {
      const s = typeof line === "string" ? line : JSON.stringify(line);
      logLines.push(s);
      if (logLines.length > 1000) logLines.shift();
    };
    try {
      const planFn = (${stored.source});
      const out = await planFn({ tab, log });
      return Response.json({ ok: true, result: out ?? null, logs: logLines });
    } catch (e) {
      return Response.json({ ok: false, error: String(e), logs: logLines }, { status: 200 });
    }
  }
};
`;

    const loader = this.env.LOADER as unknown as {
      get: (id: string, factory: () => Promise<unknown>) => Promise<{ getEntrypoint: () => { fetch: (req: Request) => Promise<Response> } }>;
    };

    try {
      const worker = await loader.get(stored.codeId, async () => {
        let tabBinding: unknown;
        try { tabBinding = ctx.exports.TabBinding({ props: { sessionId: stored.tabBindingSessionId } }); }
        catch (e) { throw new Error(`tab_binding_export_missing: ${String(e)}`); }
        return {
          compatibilityDate: "2026-04-17",
          mainModule: "plan.js",
          modules: { "plan.js": wrapped },
          globalOutbound: null,
          env: { TAB: tabBinding },
          limits: { cpuMs: 30_000 },
        };
      });
      const entry = worker.getEntrypoint();
      const res = await entry.fetch(new Request("http://plan.local/run"));
      return await res.json();
    } catch (e) {
      return { ok: false, error: `runPlan_failed: ${String(e)}` };
    }
  }
}
