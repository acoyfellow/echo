import { getAgentByName } from "agents";
import { mintWorkerCapability, verifyCapability } from "./auth";
import { readBoundedBody } from "./body";
import type { Env } from "./types";

const tools = [
  {
    name: "echo_list_capabilities",
    description: "List capabilities exposed by the user-approved app tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "echo_call_capability",
    description: "Call one capability exposed by the user-approved app tab.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 128 },
        input: {},
        operationId: { type: "string", minLength: 1, maxLength: 128 },
      },
      required: ["name", "input"],
    },
  },
];

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
  if (!verified) return Response.json({ error: "invalid_session" }, { status: 401 });

  if (body.method?.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (body.id === undefined) return rpcError(null, -32600, "request_id_required");

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
  if (body.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools } });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "method_not_found");

  const name = body.params?.name;
  const args = body.params?.arguments as Record<string, unknown> | undefined;
  if (!tools.some((tool) => tool.name === name)) return rpcError(body.id, -32601, "tool_not_found");
  const agent = await getAgentByName(env.ECHO_AGENT, verified.id);
  const workerToken = await mintWorkerCapability(env.ECHO_SIGNING_SECRET, verified.id, verified.origin, verified.expiresAt, verified.appId, verified.grants);
  let result;
  if (name === "echo_list_capabilities") result = await agent.listCapabilities(workerToken);
  else {
    const capabilityName = String(args?.name ?? "");
    const operationId = typeof args?.operationId === "string" ? args.operationId : undefined;
    if (!capabilityName || capabilityName.length > 128) result = { ok: false, error: "capability_name_invalid" };
    else if (!args || !Object.hasOwn(args, "input")) result = { ok: false, error: "capability_input_required" };
    else if (operationId && operationId.length > 128) result = { ok: false, error: "operation_id_invalid" };
    else {
      const inputBytes = new TextEncoder().encode(JSON.stringify(args.input)).byteLength;
      result = inputBytes > 65536
        ? { ok: false, error: "capability_input_too_large" }
        : await agent.callCapability(workerToken, capabilityName, args.input, operationId);
    }
  }
  const serialized = JSON.stringify(result);
  const bounded = new TextEncoder().encode(serialized).byteLength > 262144 ? { ok: false, error: "tool_result_too_large" } : result;
  return Response.json({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      content: [{ type: "text", text: JSON.stringify(bounded) }],
      structuredContent: bounded,
      isError: !bounded.ok,
    },
  });
}
