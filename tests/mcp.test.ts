import { describe, expect, mock, test } from "bun:test";
import { mintSessionCapabilities } from "../src/auth";
import type { Env } from "../src/types";

mock.module("agents", () => ({ getAgentByName: async () => { throw new Error("unexpected dispatch"); } }));
const { handleMcp } = await import("../src/mcp");

const secret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";
const env = {
  ECHO_SIGNING_SECRET: secret,
  ECHO_MAX_MCP_BYTES: "1024",
} as Env;

async function session() {
  return mintSessionCapabilities(secret, "https://example.com", 1, "notes", [{ name: "readState", effect: "read" }]);
}

describe("capability endpoint", () => {
  test("lists only the extension-free capability tools", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env);
    const body = await response.json() as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "echo_list_capabilities",
      "echo_call_capability",
    ]);
  });

  test("rejects a page credential on MCP", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.pageToken)}`, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env);
    expect(response.status).toBe(401);
  });

  test("rejects oversized request bodies before dispatch", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, {
      method: "POST",
      body: "x".repeat(1025),
    }), env);
    expect(response.status).toBe(413);
  });

  test("stops reading an oversized streamed request", async () => {
    const minted = await session();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(600)));
        controller.enqueue(new TextEncoder().encode("x".repeat(600)));
        controller.close();
      },
    });
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, {
      method: "POST",
      body: stream,
    }), env);
    expect(response.status).toBe(413);
  });
});
