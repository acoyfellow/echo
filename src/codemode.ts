import { WorkerEntrypoint, exports } from "cloudflare:workers";
import "./worker-env";
import { getAgentByName } from "agents";
import type { CapabilityGrant } from "./auth";
import {
  codemodeModule,
  maxCodemodeCalls,
  operationPrefix,
  sha256Hex,
  type CodemodeCall,
  type CodemodeResult,
} from "./codemode-source";
import { parseEchoResult, sandboxOutcome, type Json } from "./schema";
import type { Env, WebMcpResult } from "./types";

export type CapabilityBridgeProps = {
  sessionId: string;
  workerToken: string;
  operationPrefix: string;
};

export class CapabilityBridge extends WorkerEntrypoint<Env, CapabilityBridgeProps> {
  async call(sequence: number, capability: string, input: Json): Promise<WebMcpResult> {
    if (!Number.isInteger(sequence) || sequence < 0 || sequence >= maxCodemodeCalls)
      return { ok: false, error: "codemode_call_limit" };
    const { sessionId, workerToken, operationPrefix } = this.ctx.props;
    const agent = await getAgentByName(this.env.ECHO_AGENT, sessionId);

    return parseEchoResult(
      await agent.callCapability(
        workerToken,
        capability,
        JSON.stringify(input),
        `${operationPrefix}:${sequence}`,
      ),
    );
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
  const props: CapabilityBridgeProps = {
    sessionId: options.sessionId,
    workerToken: options.workerToken,
    operationPrefix: operationPrefix(options.runId),
  };

  const bridge = exports.CapabilityBridge({ props });

  const source = codemodeModule(options.code, options.grants);

  const worker = options.env.LOADER.get(
    `codemode-${await sha256Hex(`${options.sessionId}:${options.runId}:${source}`)}`,
    () => ({
      compatibilityDate: "2026-04-17",
      mainModule: "run.js",
      modules: { "run.js": source },
      globalOutbound: null,
      env: { BRIDGE: bridge },
    }),
  );

  let outcome: WebMcpResult;

  try {
    const response = await worker.getEntrypoint().fetch(new Request("https://codemode.echo/run"));
    const parsed = sandboxOutcome.safeParse(await response.json());

    outcome = parsed.success ? parsed.data : { ok: false, error: "codemode_result_invalid" };
  } catch (error) {
    outcome = { ok: false, error: `codemode_failed: ${String(error)}` };
  }

  return { ...outcome, calls: await options.readCalls(props.operationPrefix) };
}
