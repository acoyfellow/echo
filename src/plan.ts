/**
 * EchoPlan — the workflow.
 *
 * The plan source the agent submits is a JS function expression that
 * receives `{ tab, log }`. The workflow:
 *
 *   1. boots a Worker Loader sandbox containing the plan source
 *   2. runs the sandbox to completion (one fetch into the facet)
 *   3. returns the result (the plan's return value + logs)
 *
 * Steps the workflow records (durable, replayable):
 *   - boot-plan-facet      (cached: same code ⇒ no rebuild)
 *   - run-plan-to-completion
 *
 * Inside the facet, every `await tab.execute(code)` is an RPC to the
 * supervisor's `invokeTab`. Because the facet is in a separate isolate
 * with no other outbound, the RPC is the only way to reach the world.
 */

import { AgentWorkflow } from "agents/workflows";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { EchoAgent } from "./agent";
import type { PlanParams } from "./types";

type WorkflowPayload<T> = T & Record<string, unknown>;

export class EchoPlan extends AgentWorkflow<EchoAgent, PlanParams> {
  async run(
    event: Readonly<WorkflowEvent<WorkflowPayload<PlanParams>>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const { planSource } = event.payload;
    const planId = this.workflowId;

    const boot = (await step.do("boot-plan-facet", async () => {
      const r = await this.agent.bootPlan(planId, planSource);
      // Strip non-serializable members from the RPC stub before returning.
      return { ok: r.ok, error: r.error ?? null };
    })) as { ok: boolean; error: string | null };
    if (!boot.ok) return { ok: false, stage: "boot", error: boot.error };

    const result = await step.do(
      "run-plan-to-completion",
      { retries: { limit: 0, delay: "1 second" } },
      async () => {
        return await this.agent.runPlan(planId);
      },
    );

    return result;
  }
}
