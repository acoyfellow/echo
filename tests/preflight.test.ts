import { describe, it, expect } from "bun:test";
import { preflight } from "../src/preflight";

const ORIGIN = "https://example.com";

describe("preflight: fetch", () => {
  it("accepts a good GET", () => {
    expect(preflight("fetch", { path: "/x" }, ORIGIN)).toBeNull();
  });
  it("rejects missing path", () => {
    expect(preflight("fetch", {}, ORIGIN)?.error).toBe("path_required");
  });
  it("rejects cross-origin path", () => {
    expect(preflight("fetch", { path: "https://evil.com/x" }, ORIGIN)?.error).toBe("cross_origin_blocked");
  });
  it("rejects bad method", () => {
    expect(preflight("fetch", { path: "/x", method: "BREW" }, ORIGIN)?.error).toBe("method_not_allowed");
  });
  it("rejects when origin missing", () => {
    expect(preflight("fetch", { path: "/x" }, null)?.error).toBe("session_unbound");
  });
});

describe("preflight: read", () => {
  it("accepts good shape", () => {
    expect(preflight("read", { selector: "table tr", shape: { k: "a | text" } }, ORIGIN)).toBeNull();
  });
  it("rejects empty selector", () => {
    expect(preflight("read", { selector: "", shape: {} }, ORIGIN)?.error).toBe("selector_required");
  });
  it("rejects missing shape", () => {
    expect(preflight("read", { selector: "x" }, ORIGIN)?.error).toBe("shape_required");
  });
});

describe("preflight: ask", () => {
  it("accepts a prompt", () => {
    expect(preflight("ask", { prompt: "are you sure?" }, ORIGIN)).toBeNull();
  });
  it("rejects empty prompt", () => {
    expect(preflight("ask", { prompt: "" }, ORIGIN)?.error).toBe("prompt_required");
  });
  it("rejects oversized prompt", () => {
    expect(preflight("ask", { prompt: "x".repeat(5000) }, ORIGIN)?.error).toBe("prompt_too_long");
  });
});

describe("preflight: unknown verb", () => {
  it("rejects", () => {
    // @ts-expect-error testing runtime guard
    expect(preflight("oof", {}, ORIGIN)?.error).toBe("unknown_verb");
  });
});
