import { describe, expect, test } from "bun:test";
import { readBoundedBody } from "../src/body";

describe("bounded request body", () => {
  test("stops an oversized streamed body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await readBoundedBody(new Request("https://echo.example/sessions", { method: "POST", body }), 1024);
    expect(result).toBeNull();
    expect(cancelled).toBe(true);
  });

  test("returns a body within the limit", async () => {
    const request = new Request("https://echo.example/sessions", { method: "POST", body: "{\"origin\":\"https://example.com\"}" });
    expect(await readBoundedBody(request, 4096)).toBe("{\"origin\":\"https://example.com\"}");
  });
});
