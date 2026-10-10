import { getAgentByName } from "agents";
import { mintWorkerCapability, verifyCapability } from "./auth";
import { readBoundedBody } from "./body";
import { runCodemode } from "./codemode";
import { declareCapabilities, maxCodemodeCalls, operationPrefix } from "./codemode-source";
import {
  callArguments,
  parseEchoResult,
  parseJson,
  rpcRequest,
  runArguments,
  type RpcRequest,
} from "./schema";
import type { Env } from "./types";

const maxCodeBytes = 65536;

const tools = [
  {
    name: "echo_run",
    description: `Run one async JavaScript function body against the user-approved app. The only reachable API is \`app\`: each registered capability is \`await app.<name>(input)\`. No network, no DOM, no globals from the page. Return a value to receive it. At most ${maxCodemodeCalls} capability calls per run. Call echo_describe first for TypeScript declarations.`,
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", minLength: 1, maxLength: maxCodeBytes },
        runId: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
      },
      required: ["code", "runId"],
      additionalProperties: false,
    },
  },
  {
    name: "echo_describe",
    description: "Return TypeScript declarations for the `app` object available inside echo_run.",
    inputSchema: { type: "object", properties: {} },
  },
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

function rpcError(id: RpcRequest["id"], code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const maxBytes = Number(env.ECHO_MAX_MCP_BYTES || "131072");
  const declaredBytes = Number(request.headers.get("content-length") || "0");

  if (declaredBytes > maxBytes)
    return Response.json({ error: "request_too_large" }, { status: 413 });
  const text = await readBoundedBody(request, maxBytes);

  if (text === null) return Response.json({ error: "request_too_large" }, { status: 413 });
  const payload = parseJson(text);

  if (payload === undefined) return rpcError(null, -32700, "parse_error");
  const parsedBody = rpcRequest.safeParse(payload);

  if (!parsedBody.success) return rpcError(null, -32600, "invalid_request");
  const body: RpcRequest = parsedBody.data;

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

  if (body.method === "tools/list")
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools } });

  if (body.method !== "tools/call") return rpcError(body.id, -32601, "method_not_found");

  const name = body.params?.name;
  const args = body.params?.arguments ?? {};

  if (!tools.some((tool) => tool.name === name)) return rpcError(body.id, -32601, "tool_not_found");
  const agent = await getAgentByName(env.ECHO_AGENT, verified.id);

  const workerToken = await mintWorkerCapability(
    env.ECHO_SIGNING_SECRET,
    verified.id,
    verified.origin,
    verified.expiresAt,
    verified.appId,
    verified.grants,
  );

  let result;

  if (name === "echo_describe")
    result = {
      ok: true,
      result: { declarations: declareCapabilities(verified.grants), capabilities: verified.grants },
    };
  else if (name === "echo_run") {
    const parsedRun = runArguments.safeParse(args);

    if (!parsedRun.success) {
      result = { ok: false, error: "run_arguments_invalid", calls: [] };
    } else if (new TextEncoder().encode(parsedRun.data.code).byteLength > maxCodeBytes) {
      result = { ok: false, error: "code_invalid", calls: [] };
    } else {
      const { code, runId } = parsedRun.data;
      const prefix = operationPrefix(runId);
      const previous = await agent.listOperations(workerToken, prefix);

      result =
        previous.length > 0
          ? { ok: false, error: "run_id_reused", calls: previous }
          : await runCodemode({
              env,
              sessionId: verified.id,
              workerToken,
              grants: verified.grants,
              code,
              runId,
              readCalls: (candidate) => agent.listOperations(workerToken, candidate),
            });
    }
  } else if (name === "echo_list_capabilities") {
    result = parseEchoResult(await agent.listCapabilities(workerToken));
  } else {
    const parsedCall = callArguments.safeParse(args);

    if (!parsedCall.success) {
      result = { ok: false, error: "capability_arguments_invalid" };
    } else {
      const { name: capability, input, operationId } = parsedCall.data;
      const inputBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;

      result =
        inputBytes > 65536
          ? { ok: false, error: "capability_input_too_large" }
          : parseEchoResult(
              await agent.callCapability(
                workerToken,
                capability,
                JSON.stringify(input),
                operationId,
              ),
            );
    }
  }

  const serialized = JSON.stringify(result);

  const bounded =
    new TextEncoder().encode(serialized).byteLength > 262144
      ? { ok: false, error: "tool_result_too_large" }
      : result;

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
