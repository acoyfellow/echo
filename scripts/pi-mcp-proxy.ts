import { z } from "zod";
import { json, type Json } from "../src/schema";

const jsonRpcRequest = z
  .object({
    jsonrpc: z.string().optional(),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    method: z.string().optional(),
    params: z.json().optional(),
  })
  .passthrough();

type JsonRpcRequest = z.infer<typeof jsonRpcRequest>;

export async function forwardMcpRequest(
  url: string,
  request: JsonRpcRequest,
): Promise<Json | undefined> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(35_000),
  });

  if (!response.ok) {
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32000, message: `echo_http_${response.status}` },
    };
  }

  if (response.status === 202 || response.status === 204) return undefined;

  return json.parse(await response.json());
}

function readSessionUrl(): string {
  const supplied = process.env.ECHO_MCP_URL;

  if (supplied) return validateSessionUrl(supplied, process.env.ECHO_WORKER_ORIGIN ?? "");

  const result = Bun.spawnSync(
    [
      "security",
      "find-generic-password",
      "-a",
      process.env.USER ?? "",
      "-s",
      "echo-webmcp-mcp-url",
      "-w",
    ],
    { stderr: "ignore" },
  );

  if (result.exitCode !== 0) throw new Error("echo_session_missing");

  const origin = Bun.spawnSync(
    [
      "security",
      "find-generic-password",
      "-a",
      process.env.USER ?? "",
      "-s",
      "echo-webmcp-worker-origin",
      "-w",
    ],
    { stderr: "ignore" },
  );

  if (origin.exitCode !== 0) throw new Error("echo_worker_origin_missing");

  return validateSessionUrl(result.stdout.toString().trim(), origin.stdout.toString().trim());
}

export function validateSessionUrl(value: string, expectedOrigin: string): string {
  const url = new URL(value);

  const loopbackHttp =
    url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");

  if (url.protocol !== "https:" && !loopbackHttp) throw new Error("echo_session_url_not_secure");

  if (url.pathname !== "/mcp" || !url.searchParams.get("id"))
    throw new Error("echo_session_url_invalid");

  if (!expectedOrigin || url.origin !== expectedOrigin)
    throw new Error("echo_session_origin_mismatch");

  return url.toString();
}

async function main(): Promise<void> {
  const sessionUrl = readSessionUrl();
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;
    pending += decoder.decode(value, { stream: true });

    if (new TextEncoder().encode(pending).byteLength > 1048576)
      throw new Error("echo_input_line_too_large");
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let request: JsonRpcRequest;

      try {
        request = jsonRpcRequest.parse(JSON.parse(line));
      } catch {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse_error" } })}\n`,
        );
        continue;
      }

      try {
        const response = await forwardMcpRequest(sessionUrl, request);

        if (response !== undefined && request.id !== undefined)
          process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch {
        if (request.id !== undefined)
          process.stdout.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32000, message: "echo_unreachable" } })}\n`,
          );
      }
    }
  }
}

if (import.meta.main) await main();
