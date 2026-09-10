import { afterAll, describe, expect, test } from "bun:test";
import { forwardMcpRequest, validateSessionUrl } from "../scripts/pi-mcp-proxy";

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/mcp") return new Response("missing", { status: 404 });
    const body = await request.json() as { id?: number; method?: string };
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { method: body.method } });
  },
});

afterAll(() => server.stop(true));

describe("Pi MCP proxy", () => {
  test("forwards JSON-RPC without changing the request identity", async () => {
    const result = await forwardMcpRequest(`http://127.0.0.1:${server.port}/mcp?id=fake`, {
      jsonrpc: "2.0",
      id: 17,
      method: "tools/list",
    });
    expect(result).toEqual({ jsonrpc: "2.0", id: 17, result: { method: "tools/list" } });
  });

  test("does not emit a response for an accepted notification", async () => {
    const result = await forwardMcpRequest(`http://127.0.0.1:${server.port}/mcp?id=fake`, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(result).toBeUndefined();
  });

  test("returns a redacted transport error", async () => {
    const result = await forwardMcpRequest(`http://127.0.0.1:${server.port}/missing`, {
      jsonrpc: "2.0",
      id: 18,
      method: "tools/list",
    });
    expect(result).toEqual({ jsonrpc: "2.0", id: 18, error: { code: -32000, message: "echo_http_404" } });
  });

  test("pins the copied session to the configured Worker origin", () => {
    expect(validateSessionUrl("https://echo.example/mcp?id=mcp.token", "https://echo.example")).toBe("https://echo.example/mcp?id=mcp.token");
    expect(() => validateSessionUrl("https://evil.example/mcp?id=mcp.token", "https://echo.example")).toThrow("echo_session_origin_mismatch");
    expect(() => validateSessionUrl("http://echo.example/mcp?id=mcp.token", "http://echo.example")).toThrow("echo_session_url_not_secure");
    expect(() => validateSessionUrl("ftp://localhost/mcp?id=mcp.token", "ftp://localhost")).toThrow("echo_session_url_not_secure");
    expect(() => validateSessionUrl("ws://127.0.0.1/mcp?id=mcp.token", "ws://127.0.0.1")).toThrow("echo_session_url_not_secure");
  });
});
