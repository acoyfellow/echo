import { describe, expect, it } from "bun:test";
import {
  mintSessionCapabilities,
  mintWorkerCapability,
  verifyCapability,
  type CapabilityGrant,
} from "../src/auth";

const secret = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";

const origin = "https://example.com";

const appId = "notes";

const grants: CapabilityGrant[] = [
  { name: "readState", effect: "read" },
  { name: "setDraft", effect: "mutation" },
];

async function session() {
  return mintSessionCapabilities(secret, origin, 1, appId, grants);
}

describe("session capabilities", () => {
  it("mints distinct MCP and page credentials for one session and grant", async () => {
    const minted = await session();
    expect(minted.pageToken).not.toBe(minted.mcpToken);
    const mcp = await verifyCapability(secret, minted.mcpToken, "mcp");
    const page = await verifyCapability(secret, minted.pageToken, "page");
    expect(mcp?.id).toBe(minted.id);
    expect(page?.id).toBe(minted.id);
    expect(mcp?.appId).toBe(appId);
    expect(page?.grants).toEqual(grants);
  });

  it("does not accept credentials on another authority channel", async () => {
    const minted = await session();

    const workerToken = await mintWorkerCapability(
      secret,
      minted.id,
      origin,
      minted.expiresAt,
      appId,
      grants,
    );

    expect(await verifyCapability(secret, minted.mcpToken, "page")).toBeNull();
    expect(await verifyCapability(secret, minted.pageToken, "mcp")).toBeNull();
    expect(await verifyCapability(secret, minted.pageToken, "worker")).toBeNull();
    expect((await verifyCapability(secret, workerToken, "worker"))?.id).toBe(minted.id);
  });

  it("rejects tampering, wrong secrets, malformed values, and non-origin values", async () => {
    const minted = await session();
    const parts = minted.mcpToken.split(".");
    parts[6] = "AAAA";
    expect(await verifyCapability(secret, parts.join("."), "mcp")).toBeNull();
    expect(
      await verifyCapability(
        "different-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        minted.mcpToken,
        "mcp",
      ),
    ).toBeNull();
    expect(await verifyCapability(secret, "a.b.c", "mcp")).toBeNull();
    const invalid = await mintSessionCapabilities(secret, "not-an-origin", 1, appId, grants);
    expect(await verifyCapability(secret, invalid.mcpToken, "mcp")).toBeNull();
  });
});
