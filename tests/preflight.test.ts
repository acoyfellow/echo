import { describe, it, expect } from "bun:test";
import { preflightExecute } from "../src/preflight";

describe("preflightExecute", () => {
  it("accepts a normal code string", () => {
    expect(preflightExecute({ code: "return 1+1" })).toBeNull();
  });
  it("rejects missing code", () => {
    expect(preflightExecute({})?.error).toBe("code_required");
  });
  it("rejects empty code", () => {
    expect(preflightExecute({ code: "" })?.error).toBe("code_required");
  });
  it("rejects non-string code", () => {
    expect(preflightExecute({ code: 123 })?.error).toBe("code_required");
  });
  it("rejects oversized code", () => {
    const big = "x".repeat(200_000);
    const r = preflightExecute({ code: big }, 65536);
    expect(r?.error).toBe("code_too_large");
  });
});
