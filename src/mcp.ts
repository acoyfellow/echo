import { getAgentByName } from "agents";
import { mintWorkerCapability, verifyCapability } from "./auth";
import { readBoundedBody } from "./body";
import type { Env } from "./types";

const tool = {
  name: "page_evaluate",
  description: "Run JavaScript with the full authority of the user-approved page.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", minLength: 1, maxLength: 65536 },
      operationId: { type: "string", minLength: 1, maxLength: 128 },
    },
    required: ["code", "operationId"],
    additionalProperties: false,
  },
};

type RpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: unknown };
};

function rpcError(id: RpcRequest["id"], code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const maxBytes = Number(env.ECHO_MAX_MCP_BYTES || "131072");
  const declaredBytes = Number(request.headers.get("content-length") || "0");
  if (declaredBytes > maxBytes) return Response.json({ error: "request_too_large" }, { status: 413 });
  const text = await readBoundedBody(request, maxBytes);
  if (text === null) return Response.json({ error: "request_too_large" }, { status: 413 });
  let body: RpcRequest;
  try { body = JSON.parse(text) as RpcRequest; }
  catch { return rpcError(null, -32700, "parse_error"); }

  const signed = new URL(request.url).searchParams.get("id");
  if (!signed) return Response.json({ error: "session_id_required" }, { status: 400 });
  const verified = await verifyCapability(env.ECHO_SIGNING_SECRET, signed, "mcp");
  if (!verified || verified.appId !== "echo-codemode" || verified.grants.length !== 1 || verified.grants[0]?.name !== "page.evaluate") {
    return Response.json({ error: "invalid_session" }, { status: 401 });
  }
  if (body.method?.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (body.id === undefined) return rpcError(null, -32600, "request_id_required");
  if (body.method === "initialize") {
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "echo", version: "0.0.1" } } });
  }
  if (body.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [tool] } });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "method_not_found");
  if (body.params?.name !== tool.name) return rpcError(body.id, -32601, "tool_not_found");

  const args = body.params.arguments as { code?: unknown; operationId?: unknown } | undefined;
  if (typeof args?.code !== "string" || args.code.length === 0 || args.code.length > 65536) return rpcError(body.id, -32602, "code_invalid");
  if (typeof args.operationId !== "string" || args.operationId.length === 0 || args.operationId.length > 128) return rpcError(body.id, -32602, "operation_id_invalid");
  const agent = await getAgentByName(env.ECHO_AGENT, verified.id);
  const workerToken = await mintWorkerCapability(env.ECHO_SIGNING_SECRET, verified.id, verified.origin, verified.expiresAt, verified.appId, verified.grants);
  const result = await agent.callCapability(workerToken, "page.evaluate", { code: args.code }, args.operationId);
  const serialized = JSON.stringify(result);
  const bounded = new TextEncoder().encode(serialized).byteLength > 262144 ? { ok: false, error: "tool_result_too_large" } : result;
  return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(bounded) }], structuredContent: bounded, isError: !bounded.ok } });
}
