import { z } from "zod";
import type { Env } from "../src/types";

export const testSecret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";

function unreachable(): never {
  throw new Error("unexpected binding access");
}

export function testEnv(maxMcpBytes = "1024"): Env {
  // SAFETY: tests never reach the Durable Object namespace; every property access throws.
  const agents = new Proxy({} as Env["ECHO_AGENT"], { get: unreachable });

  return {
    ASSETS: { fetch: async () => new Response("not found", { status: 404 }), connect: unreachable },
    ECHO_AGENT: agents,
    LOADER: { get: unreachable, load: unreachable },
    ECHO_SIGNING_SECRET: testSecret,
    ECHO_HOSTED_INSTANCE: "dev",
    ECHO_MAX_SESSION_HOURS: "1",
    ECHO_MAX_MCP_BYTES: maxMcpBytes,
  };
}

export const mintedSessionBody = z.object({
  id: z.string(),
  pageToken: z.string(),
  mcpToken: z.string(),
  expiresAt: z.number(),
});

export const toolsListBody = z.object({
  result: z.object({ tools: z.array(z.object({ name: z.string(), description: z.string() })) }),
});

export const sentMessage = z.object({
  type: z.string(),
  callId: z.string(),
  result: z.object({ ok: z.boolean(), result: z.any().optional(), error: z.string().optional() }),
});
