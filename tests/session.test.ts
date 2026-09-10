import { describe, expect, test } from "bun:test";
import type { Env } from "../src/types";
import { verifyCapability } from "../src/auth";

import { handleSessionCreate } from "../src/sessions";

const secret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";
const env = {
  ECHO_SIGNING_SECRET: secret,
  ECHO_HOSTED_INSTANCE: "dev",
  ECHO_MAX_SESSION_HOURS: "1",
  ECHO_MAX_MCP_BYTES: "1024",
  ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
} as unknown as Env;

function request(originHeader?: string, bodyOrigin = "https://notes.example", capabilities: unknown = [{ name: "readState", effect: "read" }, { name: "setDraft", effect: "mutation" }]): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (originHeader) headers.set("origin", originHeader);
  return new Request("https://echo.example/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ origin: bodyOrigin, appId: "notes", capabilities }),
  });
}

describe("page session grants", () => {
  test("requires the browser request origin to match the app origin", async () => {
    expect((await handleSessionCreate(request(), env)).status).toBe(403);
    expect((await handleSessionCreate(request("https://other.example"), env)).status).toBe(403);
  });

  test("signs the exact app and capability grant into both authority channels", async () => {
    const response = await handleSessionCreate(request("https://notes.example"), env);
    expect(response.status).toBe(200);
    const session = await response.json() as { pageToken: string; mcpToken: string };
    const page = await verifyCapability(secret, session.pageToken, "page");
    const mcp = await verifyCapability(secret, session.mcpToken, "mcp");
    expect(page?.appId).toBe("notes");
    expect(page?.origin).toBe("https://notes.example");
    expect(page?.grants).toEqual([
      { name: "readState", effect: "read" },
      { name: "setDraft", effect: "mutation" },
    ]);
    expect(mcp?.grants).toEqual(page?.grants);
  });

  test("rejects missing, duplicate, and malformed capability grants", async () => {
    expect((await handleSessionCreate(request("https://notes.example", "https://notes.example", []), env)).status).toBe(400);
    expect((await handleSessionCreate(request("https://notes.example", "https://notes.example", [
      { name: "readState", effect: "read" },
      { name: "readState", effect: "mutation" },
    ]), env)).status).toBe(400);
    expect((await handleSessionCreate(request("https://notes.example", "https://notes.example", [{ name: "stopEcho", effect: "admin" }]), env)).status).toBe(400);
  });
});
