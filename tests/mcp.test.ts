import { describe, expect, mock, test } from "bun:test";
import { mintSessionCapabilities } from "../src/auth";
import type { Env } from "../src/types";

mock.module("agents", () => ({ getAgentByName: async () => { throw new Error("unexpected dispatch"); } }));
const { handleMcp } = await import("../src/mcp");

const secret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";
const env = { ECHO_SIGNING_SECRET: secret, ECHO_MAX_MCP_BYTES: "1024" } as Env;

async function session() {
  return mintSessionCapabilities(secret, "https://example.com", 1, "echo-codemode", [{ name: "page.evaluate", effect: "mutation" }]);
}

describe("Codemode MCP endpoint", () => {
  test("lists one full-page JavaScript tool", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);
    const body = await response.json() as { result: { tools: Array<{ name: string; description: string }> } };
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0]?.name).toBe("page_evaluate");
    expect(body.result.tools[0]?.description).toContain("full authority");
  });

  test("rejects a non-Codemode credential", async () => {
    const minted = await mintSessionCapabilities(secret, "https://example.com", 1, "notes", [{ name: "readState", effect: "read" }]);
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);
    expect(response.status).toBe(401);
  });

  test("rejects a page credential on MCP", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.pageToken)}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);
    expect(response.status).toBe(401);
  });

  test("rejects oversized request bodies before dispatch", async () => {
    const minted = await session();
    const response = await handleMcp(new Request(`https://echo.example/mcp?id=${encodeURIComponent(minted.mcpToken)}`, { method: "POST", body: "x".repeat(1025) }), env);
    expect(response.status).toBe(413);
  });
});
