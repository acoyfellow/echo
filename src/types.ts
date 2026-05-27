/**
 * Shared types.
 *
 * Env is what wrangler.jsonc binds + the secret. Cloudflare's generated
 * runtime types declare `Cloudflare.Env` ambiently; we narrow it here.
 */

import type { EchoAgent } from "./agent";
import type { EchoPlan } from "./plan";

export interface Env {
  ECHO_AGENT: DurableObjectNamespace<EchoAgent>;
  LOADER: Fetcher; // Worker Loader binding — not yet typed in @cloudflare/workers-types
  PLAN: Workflow;
  ECHO_SIGNING_SECRET: string;
  ECHO_HOSTED_INSTANCE: string;
  ECHO_MAX_SESSION_HOURS: string;
  ECHO_MAX_PLAN_BYTES: string;
}

export type Verb = "fetch" | "read" | "ask";

export type FetchArgs = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type ReadArgs = {
  selector: string;
  shape: Record<string, string>;
  limit?: number;
};

export type AskArgs = {
  prompt: string;
  options?: string[];
  detail?: Record<string, unknown>;
};

export type CallResult = unknown;

export type PlanParams = {
  planSource: string;
  sessionId: string;
  origin: string;
};
