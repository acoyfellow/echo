/**
 * EchoPlan — the dynamic workflow that runs a user's plan.
 *
 * AgentWorkflow gives us:
 *   - this.agent : RPC stub to the originating EchoAgent
 *   - durable step semantics
 *   - automatic step-cache replay
 *
 * The plan source is the agent's TypeScript. Three execution shapes are
 * supported (in increasing power):
 *
 * 1. **Inline workflow body (v0.0.1 default).** The plan source is
 *    evaluated inside a step.do directly. The plan runs in the workflow's
 *    own isolate, NOT in a separate Worker Loader sandbox. This is the
 *    fast-path shipped in session 1.
 *
 * 2. **Worker Loader sandbox (v0.0.2 hardening).** The plan source is
 *    loaded into a Dynamic Worker with `globalOutbound: null` and only
 *    the `tab` binding. This is what we want long term — the plan
 *    cannot reach `env.PLAN`, `env.ECHO_AGENT`, or anything else. For
 *    session 1 we stub this — the plan still has access to `env`,
 *    which is wrong but ok for the demo.
 *
 * 3. **AgentWorkflow `step.do` for each tab call.** Already provided.
 *    The first `await tab.fetch(...)` is a step; the second is a step;
 *    replay is automatic.
 *
 * The plan's environment is a synthetic `tab` object whose methods are
 * the three verbs, wired through `this.agent.invokeTab(verb, args)`.
 * Every call is wrapped in `step.do` so the workflow records it.
 */

import { AgentWorkflow } from "agents/workflows";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { EchoAgent } from "./agent";
import type { PlanParams } from "./types";

// AgentWorkflowParams<T> = T & internal bookkeeping fields the SDK adds.
// The internal type isn't re-exported; we approximate it as the user-supplied
// params merged with whatever the SDK appends. Source:
// node_modules/agents/dist/workflow-types-*.d.ts (AgentWorkflowParams<T> = T & AgentWorkflowInternalParams).
type WorkflowPayload<T> = T & Record<string, unknown>;

type TabCall = {
  fetch: (args: unknown) => Promise<unknown>;
  read: (args: unknown) => Promise<unknown>;
  ask: (args: unknown) => Promise<unknown>;
};

export class EchoPlan extends AgentWorkflow<EchoAgent, PlanParams> {
  async run(
    event: Readonly<WorkflowEvent<WorkflowPayload<PlanParams>>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const { planSource, sessionId, origin } = event.payload;

    // Build the `tab` binding the plan calls. Each verb wraps a step.do,
    // so it's durable: on workflow retry/resume, the step result comes
    // out of the cache without re-prompting the tab.
    let callIndex = 0;
    const tab: TabCall = {
      fetch: async (args) => {
        const i = ++callIndex;
        return await step.do(`tab.fetch:${i}`, async () => {
          return await this.agent.invokeTab("fetch", args);
        });
      },
      read: async (args) => {
        const i = ++callIndex;
        return await step.do(`tab.read:${i}`, async () => {
          return await this.agent.invokeTab("read", args);
        });
      },
      ask: async (args) => {
        const i = ++callIndex;
        return await step.do(`tab.ask:${i}`, async () => {
          return await this.agent.invokeTab("ask", args);
        });
      },
    };

    // ─── Plan execution boundary ──────────────────────────────────────
    //
    // v0.0.1: eval the plan source in the workflow isolate. Wrong
    // isolation; right semantics. v0.0.2: load via env.LOADER and pass
    // `tab` as the only binding the plan sees.
    //
    // We DO NOT use eval() / new Function() because Workers disallow
    // arbitrary codegen. Instead the plan source must be a top-level
    // async function that takes a single `ctx` argument; we import it
    // as a data: URL.
    //
    // The plan author writes:
    //   export default async function plan({ tab, env, log }) { ... }

    const planResult = await step.do(
      "execute-plan",
      { retries: { limit: 0, delay: "1 second" } },   // plans are not idempotent
      async (): Promise<{ ok: boolean; result?: string; error?: string; detail?: string; log: string[] }> => {
        const moduleUrl = `data:text/javascript;base64,${btoa(planSource)}`;
        let mod: { default?: (ctx: PlanCtx) => Promise<unknown> };
        try {
          // The data URL is treated as an ES module by the runtime.
          // The plan must `export default async function`.
          mod = (await import(moduleUrl)) as typeof mod;
        } catch (e) {
          return { ok: false, error: "plan_module_load_failed", detail: String(e), log: [] };
        }
        const fn = mod.default;
        if (typeof fn !== "function") {
          return { ok: false, error: "plan_must_export_default_async_function", log: [] };
        }

        const logLines: string[] = [];
        const ctx: PlanCtx = {
          tab,
          origin,
          sessionId,
          log: (line: unknown) => {
            const s = typeof line === "string" ? line : JSON.stringify(line);
            logLines.push(s);
            if (logLines.length > 1000) logLines.shift();
          },
        };

        try {
          const out = await fn(ctx);
          // Serialize the plan's return value so it satisfies Serializable.
          return { ok: true, result: JSON.stringify(out ?? null), log: logLines };
        } catch (e) {
          return { ok: false, error: "plan_threw", detail: String(e), log: logLines };
        }
      },
    );

    return planResult;
  }
}

type PlanCtx = {
  tab: TabCall;
  origin: string;
  sessionId: string;
  log: (line: unknown) => void;
};
