import { describe, expect, test } from "bun:test";
import { verifyCapability } from "../src/auth";
import { codemodeExtensionOrigin } from "../src/codemode";
import { handleSessionCreate, handleSessionPreflight } from "../src/sessions";
import type { Env } from "../src/types";

const secret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";
const env = { ECHO_SIGNING_SECRET: secret, ECHO_MAX_SESSION_HOURS: "1" } as Env;
const grant = [{ name: "page.evaluate", effect: "mutation" as const }];

function request(originHeader = codemodeExtensionOrigin, body: Record<string, unknown> = {}): Request {
  return new Request("https://echo.example/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: originHeader },
    body: JSON.stringify({ mode: "codemode", origin: "https://app.example", appId: "echo-codemode", capabilities: grant, ...body }),
  });
}

describe("Codemode sessions", () => {
  test("allows preflight only from the trusted extension", () => {
    expect(handleSessionPreflight(request()).status).toBe(204);
    expect(handleSessionPreflight(request("https://app.example")).status).toBe(403);
  });

  test("mints the one fixed full-page grant", async () => {
    const response = await handleSessionCreate(request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(codemodeExtensionOrigin);
    const session = await response.json() as { pageToken: string; mcpToken: string };
    const page = await verifyCapability(secret, session.pageToken, "page");
    const mcp = await verifyCapability(secret, session.mcpToken, "mcp");
    expect(page?.appId).toBe("echo-codemode");
    expect(page?.origin).toBe("https://app.example");
    expect(page?.grants).toEqual(grant);
    expect(mcp?.grants).toEqual(grant);
  });

  test("rejects pages, other extensions, alternate modes, and narrower grants", async () => {
    expect((await handleSessionCreate(request("https://app.example"), env)).status).toBe(403);
    expect((await handleSessionCreate(request("chrome-extension://abcdefghijklmnopabcdefghijklmnop"), env)).status).toBe(403);
    expect((await handleSessionCreate(request(codemodeExtensionOrigin, { mode: "capabilities" }), env)).status).toBe(400);
    expect((await handleSessionCreate(request(codemodeExtensionOrigin, { capabilities: [{ name: "readState", effect: "read" }] }), env)).status).toBe(400);
  });

  test("requires a secure page origin", async () => {
    expect((await handleSessionCreate(request(codemodeExtensionOrigin, { origin: "http://app.example" }), env)).status).toBe(400);
    expect((await handleSessionCreate(request(codemodeExtensionOrigin, { origin: "http://127.0.0.1:8870" }), env)).status).toBe(200);
  });
});
