import { describe, expect, test } from "bun:test";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { codemodeModule, declareCapabilities } from "../src/codemode-source";
import { sandboxOutcome, type EchoResult, type Json } from "../src/schema";

const scratch = mkdtempSync(join(tmpdir(), "echo-codemode-"));

let moduleCount = 0;

type Outcome = EchoResult;

type Bridge = { call(sequence: number, name: string, input: Json): Promise<Outcome> };

const sandboxModule = z.object({
  default: z.object({
    fetch: z.function({
      input: [z.instanceof(Request), z.custom<{ BRIDGE: Bridge }>()],
      output: z.promise(z.instanceof(Response)),
    }),
  }),
});

const textInput = z.object({ text: z.string() });

async function execute(
  code: string,
  grants: Array<{ name: string; effect: "read" | "mutation" }>,
  call: Bridge["call"],
): Promise<Outcome> {
  const source = codemodeModule(code, grants);
  const path = join(scratch, `run-${moduleCount++}.mjs`);

  writeFileSync(path, source);
  const module = sandboxModule.parse(await import(path));

  const response = await module.default.fetch(new Request("https://codemode.echo/run"), {
    BRIDGE: { call },
  });

  return sandboxOutcome.parse(await response.json());
}

describe("Codemode sandbox module", () => {
  test("composes registered capabilities in one run with ordered sequence numbers", async () => {
    const seen: Array<[number, string, Json]> = [];
    const todos: string[] = [];

    const outcome = await execute(
      `
      for (const text of ["a", "b", "c"]) await app.addTodo({ text });
      return app.listTodos();
    `,
      [
        { name: "listTodos", effect: "read" },
        { name: "addTodo", effect: "mutation" },
      ],
      async (sequence, name, input) => {
        seen.push([sequence, name, input]);

        if (name === "addTodo") todos.push(textInput.parse(input).text);

        return { ok: true, result: name === "listTodos" ? [...todos] : null };
      },
    );

    expect(outcome).toEqual({ ok: true, result: ["a", "b", "c"] });
    expect(seen.map(([sequence, name]) => `${sequence}:${name}`)).toEqual([
      "0:addTodo",
      "1:addTodo",
      "2:addTodo",
      "3:listTodos",
    ]);
  });

  test("surfaces a capability failure as a thrown error the script can see", async () => {
    const outcome = await execute(
      `await app.deleteTodo({ id: "missing" });`,
      [{ name: "deleteTodo", effect: "mutation" }],
      async () => ({ ok: false, error: "capability_execution_failed" }),
    );

    expect(outcome).toEqual({ ok: false, error: "deleteTodo: capability_execution_failed" });
  });

  test("exposes only granted names on a frozen app object", async () => {
    const keys = await execute(
      `return Object.keys(app);`,
      [{ name: "listTodos", effect: "read" }],
      async () => ({ ok: true, result: null }),
    );

    expect(keys).toEqual({ ok: true, result: ["listTodos"] });

    const injected = await execute(
      `app.injected = () => 1;`,
      [{ name: "listTodos", effect: "read" }],
      async () => ({ ok: true, result: null }),
    );

    expect(injected.ok).toBe(false);
  });

  test("quotes capability names that are not identifiers", async () => {
    const outcome = await execute(
      `return app["todos.list"]();`,
      [{ name: "todos.list", effect: "read" }],
      async () => ({ ok: true, result: 7 }),
    );

    expect(outcome).toEqual({ ok: true, result: 7 });
  });

  test("declares the app object for the agent", () => {
    expect(
      declareCapabilities([
        { name: "listTodos", effect: "read" },
        { name: "addTodo", effect: "mutation" },
      ]),
    ).toBe(
      'declare const app: {\n  "listTodos"(input: unknown): Promise<unknown>; // read\n  "addTodo"(input: unknown): Promise<unknown>; // mutation\n};',
    );
  });
});
