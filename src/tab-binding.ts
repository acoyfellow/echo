/**
 * TabBinding — the only outbound the plan facet sees.
 *
 * The facet runs in a Worker Loader sandbox with globalOutbound:null.
 * The one binding we hand it is this WorkerEntrypoint.
 *
 * Single method: `execute(code, timeoutMs?)`. The agent's plan calls:
 *
 *   const result = await tab.execute(`
 *     const r = await fetch("/rest/api/2/search", { credentials: "include" });
 *     return await r.json();
 *   `);
 *
 * The code runs in the page's realm via the content script.
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import { getAgentByName } from "agents";
import type { Env, ExecuteArgs, ExecuteResult } from "./types";

type Props = { sessionId: string };

export class TabBinding extends WorkerEntrypoint<Env> {
  async execute(args: ExecuteArgs): Promise<ExecuteResult> {
    const props = (this.ctx as unknown as { props: Props }).props;
    const sessionId = props?.sessionId;
    if (!sessionId) return { ok: false, error: "binding_missing_session" };
    const supervisor = await getAgentByName(this.env.ECHO_AGENT, sessionId);
    return await supervisor.invokeTab(args);
  }
}
