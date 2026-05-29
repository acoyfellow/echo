import { describe, it, expect } from "bun:test";
import { mintSessionId, verifySessionId, resolvePathAgainstOrigin } from "../src/auth";

const SECRET = "test-secret-must-be-long-enough-for-hmac-sha-256-xxxxxxxxxxxxxxxx";

describe("session ids", () => {
  it("mints + verifies", async () => {
    const { id, signed } = await mintSessionId(SECRET, "https://example.com", 1);
    const v = await verifySessionId(SECRET, signed);
    expect(v).not.toBeNull();
    expect(v?.id).toBe(id);
    expect(v?.origin).toBe("https://example.com");
  });

  it("rejects tampered sig", async () => {
    const { signed } = await mintSessionId(SECRET, "https://example.com", 1);
    const parts = signed.split(".");
    parts[4] = "AAAA";
    expect(await verifySessionId(SECRET, parts.join("."))).toBeNull();
  });

  it("rejects tampered origin", async () => {
    const { signed } = await mintSessionId(SECRET, "https://example.com", 1);
    const parts = signed.split(".");
    parts[2] = btoa("https://evil.com").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect(await verifySessionId(SECRET, parts.join("."))).toBeNull();
  });

  it("rejects tampered kind (session-id confusion bug stays caught)", async () => {
    const { signed } = await mintSessionId(SECRET, "https://example.com", 1);
    const parts = signed.split(".");
    parts[0] = "installation";
    expect(await verifySessionId(SECRET, parts.join("."))).toBeNull();
  });

  it("rejects wrong secret", async () => {
    const { signed } = await mintSessionId(SECRET, "https://example.com", 1);
    expect(await verifySessionId("a-different-secret-also-long-enough-xxxxxxxxxxxxxxxxxxxxxxxxxx", signed)).toBeNull();
  });

  it("rejects expired exp", async () => {
    const { signed } = await mintSessionId(SECRET, "https://example.com", 0);
    const parts = signed.split(".");
    parts[3] = "1";
    expect(await verifySessionId(SECRET, parts.join("."))).toBeNull();
  });

  it("rejects malformed", async () => {
    expect(await verifySessionId(SECRET, "")).toBeNull();
    expect(await verifySessionId(SECRET, "a.b.c")).toBeNull();
    expect(await verifySessionId(SECRET, "a.b.c.d")).toBeNull();
    expect(await verifySessionId(SECRET, "a.b.c.d.e.f")).toBeNull();
  });
});

describe("origin enforcement", () => {
  it("accepts same-origin absolute path", () => {
    const u = resolvePathAgainstOrigin("https://jira.example.com", "/rest/api/2/search");
    expect(u?.toString()).toBe("https://jira.example.com/rest/api/2/search");
  });

  it("rejects cross-origin", () => {
    expect(resolvePathAgainstOrigin("https://jira.example.com", "https://evil.com/x")).toBeNull();
  });

  it("rejects protocol downgrade", () => {
    expect(resolvePathAgainstOrigin("https://jira.example.com", "http://jira.example.com/x")).toBeNull();
  });

  it("rejects port mismatch", () => {
    expect(resolvePathAgainstOrigin("https://jira.example.com", "https://jira.example.com:8443/x")).toBeNull();
  });

  it("rejects subdomain confusion", () => {
    expect(resolvePathAgainstOrigin("https://jira.example.com", "https://evil.jira.example.com/x")).toBeNull();
    expect(resolvePathAgainstOrigin("https://jira.example.com", "https://jira.example.com.evil.com/x")).toBeNull();
  });

  it("rejects javascript: URIs", () => {
    expect(resolvePathAgainstOrigin("https://jira.example.com", "javascript:alert(1)")).toBeNull();
  });
});
