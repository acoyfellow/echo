/**
 * Shared types.
 */

import type { EchoAgent } from "./agent";

export interface Env {
  ECHO_AGENT: DurableObjectNamespace<EchoAgent>;
  LOADER: Fetcher; // Worker Loader binding — not yet typed in @cloudflare/workers-types
  PLAN: Workflow;
  ECHO_SIGNING_SECRET: string;
  ECHO_HOSTED_INSTANCE: string;
  ECHO_MAX_SESSION_HOURS: string;
  ECHO_MAX_PLAN_BYTES: string;
}

/**
 * The plan binding the agent calls inside its plan body.
 *
 * One verb only:
 *
 *   await tab.execute(`
 *     const r = await fetch("/rest/api/2/search?...", { credentials: "include" });
 *     return await r.json();
 *   `);
 *
 * The string body is evaluated in the content script in the page's realm.
 * It has access to `document`, `window`, page-bound APIs, and `fetch` with
 * the user's session credentials. The return value of the last expression
 * is sent back to the plan facet.
 *
 * Safety posture: same as Codex's authenticated browser mode. The session
 * is HMAC-pinned to one origin; the browser enforces same-origin; the user
 * approves the session by clicking the extension icon; closing the tab
 * revokes it. No additional per-call gate.
 */
export type ExecuteArgs = {
  code: string;
  /**
   * Optional millisecond timeout (default 30s). The agent can set this
   * higher for long-running work; the content script enforces it.
   */
  timeoutMs?: number;
};

export type ExecuteResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  detail?: string;
  logs?: string[];
};

export type PlanParams = {
  planSource: string;
  sessionId: string;
  origin: string;
};
