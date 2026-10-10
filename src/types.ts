import type { EchoAgent } from "./agent";

export interface Env {
  ASSETS: Fetcher;
  ECHO_AGENT: DurableObjectNamespace<EchoAgent>;
  LOADER: WorkerLoader;
  ECHO_SIGNING_SECRET: string;
  ECHO_HOSTED_INSTANCE: string;
  ECHO_MAX_SESSION_HOURS: string;
  ECHO_MAX_MCP_BYTES: string;
  ECHO_COMMIT_SHA?: string;
}

export type { EchoResult as WebMcpResult } from "./schema";
