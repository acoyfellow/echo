/**
 * MCP endpoint — JSON-RPC over HTTP.
 *
 * One tool surface:
 *   initialize     → server capabilities
 *   tools/list     → ["run", "status"]
 *   tools/call run    args: { plan: string }      → { planId }
 *   tools/call status args: { planId: string }    → { status, ... }
 *
 * Session is identified by ?id=<signed-session-id>. The signed id pins
 * the session to one origin; we dispatch through the EchoAgent DO whose
 * `idFromName(<unsigned-id>)` matches.
 */

import { getAgentByName } from "agents";
import type { Env } from "./types";
import { verifySessionId } from "./auth";

const TOOLS = [
  {
    name: "run",
    description: "Submit a TypeScript plan to run against the user's authenticated tab. Plan must export a default async function ({ tab, log }) => unknown.",
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "ES module source (compiled, no TS syntax). `export default async function plan({ tab, log }) { ... }`" },
      },
      required: ["plan"],
    },
  },
  {
    name: "status",
    description: "Get the workflow status and step log for a plan.",
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string" },
      },
      required: ["planId"],
    },
  },
];

type RpcReq = { id?: string | number; method?: string; params?: { name?: string; arguments?: unknown } };

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const url = new URL(req.url);
  const signed = url.searchParams.get("id");
  if (!signed) return Response.json({ error: "session_id_required" }, { status: 400 });

  const verified = await verifySessionId(env.ECHO_SIGNING_SECRET, signed);
  if (!verified) return Response.json({ error: "invalid_session" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as RpcReq;

  if (body.method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "echo", version: "0.0.1" },
      },
    });
  }

  if (body.method === "tools/list") {
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: TOOLS } });
  }

  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments as Record<string, unknown> | undefined;
    if (!name || !TOOLS.find((t) => t.name === name)) {
      return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "tool_not_found" } });
    }

    const agent = await getAgentByName(env.ECHO_AGENT, verified.id);

    let result: unknown;
    let isError = false;
    try {
      if (name === "run") {
        const plan = String(args?.plan ?? "");
        if (!plan) {
          result = { error: "plan_required" };
          isError = true;
        } else {
          result = await agent.run(plan);
        }
      } else if (name === "status") {
        const planId = String(args?.planId ?? "");
        if (!planId) {
          result = { error: "planId_required" };
          isError = true;
        } else {
          result = await agent.status(planId);
          if (typeof result === "object" && result && "error" in result) isError = true;
        }
      }
    } catch (e) {
      result = { error: "tool_threw", detail: String(e) };
      isError = true;
    }

    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError,
      },
    });
  }

  return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "method_not_found" } });
}
