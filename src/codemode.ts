import { WorkerEntrypoint, exports } from "cloudflare:workers";
import { getAgentByName } from "agents";
import type { CapabilityGrant } from "./auth";
import { codemodeModule, maxCodemodeCalls, operationPrefix, sha256Hex, type CodemodeCall, type CodemodeResult } from "./codemode-source";
import type { Env, WebMcpResult } from "./types";

export type CapabilityBridgeProps = { sessionId: string; workerToken: string; operationPrefix: string };


export class CapabilityBridge extends WorkerEntrypoint<Env, CapabilityBridgeProps> {
  async call(sequence: number, capability: string, input: unknown): Promise<WebMcpResult> {
    if (!Number.isInteger(sequence) || sequence < 0 || sequence >= maxCodemodeCalls) return { ok: false, error: "codemode_call_limit" };
    const { sessionId, workerToken, operationPrefix } = this.ctx.props;
    const agent = await getAgentByName(this.env.ECHO_AGENT, sessionId);
    return agent.callCapability(workerToken, capability, input, `${operationPrefix}:${sequence}`);
  }
}

type RunCodemodeOptions = {
  env: Env;
  sessionId: string;
  workerToken: string;
  grants: CapabilityGrant[];
  code: string;
  runId: string;
  readCalls(prefix: string): Promise<CodemodeCall[]>;
};

export async function runCodemode(options: RunCodemodeOptions): Promise<CodemodeResult> {
  const props: CapabilityBridgeProps = { sessionId: options.sessionId, workerToken: options.workerToken, operationPrefix: operationPrefix(options.runId) };
  const bridge = (exports as unknown as { CapabilityBridge(options: { props: CapabilityBridgeProps }): Fetcher }).CapabilityBridge({ props });
  const source = codemodeModule(options.code, options.grants);
  const worker = options.env.LOADER.get(`codemode-${await sha256Hex(`${options.sessionId}:${options.runId}:${source}`)}`, () => ({
    compatibilityDate: "2026-04-17",
    mainModule: "run.js",
    modules: { "run.js": source },
    globalOutbound: null,
    env: { BRIDGE: bridge },
  }));
  let outcome: { ok: boolean; result?: unknown; error?: string };
  try {
    const response = await worker.getEntrypoint().fetch(new Request("https://codemode.echo/run"));
    outcome = await response.json() as typeof outcome;
  } catch (error) {
    outcome = { ok: false, error: `codemode_failed: ${String(error)}` };
  }
  return { ...outcome, calls: await options.readCalls(props.operationPrefix) };
}
