import { z } from "zod";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);

export const capabilityName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/);

export const capabilityEffect = z.enum(["read", "mutation"]);

export const capabilityGrant = z.object({ name: capabilityName, effect: capabilityEffect });

export type CapabilityGrant = z.infer<typeof capabilityGrant>;

export const capabilityGrants = z.array(capabilityGrant);

export const sessionRequest = z.object({
  origin: z.string().min(1),
  appId: capabilityName.default("legacy-webmcp"),
  capabilities: z.array(capabilityGrant).min(1).max(100),
});

export const echoResult = z.object({
  ok: z.boolean(),
  result: json.optional(),
  error: z.string().optional(),
});

export type EchoResult = z.infer<typeof echoResult>;

export const rpcRequest = z.object({
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().optional(),
  params: z
    .object({
      name: z.string().optional(),
      arguments: z.record(z.string(), json).optional(),
    })
    .optional(),
});

export type RpcRequest = z.infer<typeof rpcRequest>;

export const runArguments = z.object({
  code: z.string().min(1),
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

export const callArguments = z.object({
  name: z.string().min(1).max(128),
  input: json,
  operationId: z.string().min(1).max(128).optional(),
});

export const pageMessage = z.object({
  type: z.literal("result"),
  callId: z.string(),
  result: echoResult.optional(),
});

export const tabRequest = z.object({
  type: z.enum(["capability_list", "capability_call"]),
  callId: z.string(),
  name: z.string().optional(),
  input: json.optional(),
  operationId: z.string().optional(),
  timeoutMs: z.number().optional(),
});

export const sandboxOutcome = z.object({
  ok: z.boolean(),
  result: json.optional(),
  error: z.string().optional(),
});

export function parseJson(text: string): Json | undefined {
  try {
    const parsed = json.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseEchoResult(text: string): EchoResult {
  const parsed = echoResult.safeParse(parseJson(text));

  return parsed.success ? parsed.data : { ok: false, error: "rpc_result_invalid" };
}
