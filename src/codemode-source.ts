import type { CapabilityGrant } from "./auth";

export type CodemodeCall = { capability: string; operationId?: string; ok: boolean; error?: string };

export type CodemodeResult = { ok: boolean; result?: unknown; error?: string; calls: CodemodeCall[] };

export function operationPrefix(runId: string): string {
  return `run:${runId}`;
}

export const maxCodemodeCalls = 100;

function identifier(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
}

export function declareCapabilities(grants: CapabilityGrant[]): string {
  const members = grants.map((grant) => `  ${JSON.stringify(grant.name)}(input: unknown): Promise<unknown>; // ${grant.effect}`);
  return `declare const app: {\n${members.join("\n")}\n};`;
}

export function codemodeModule(code: string, grants: CapabilityGrant[]): string {
  const bindings = grants.map((grant) => `app${identifier(grant.name)} = (input) => unwrap(${JSON.stringify(grant.name)}, input);`).join("\n");
  return `export default {
  async fetch(request, env) {
    let sequence = 0;
    const unwrap = async (name, input) => {
      const outcome = await env.BRIDGE.call(sequence++, name, input ?? {});
      if (!outcome.ok) throw new Error(name + ": " + (outcome.error ?? "capability_failed"));
      return outcome.result;
    };
    const app = {};
    ${bindings}
    Object.freeze(app);
    try {
      const run = async () => {
${code}
      };
      return Response.json({ ok: true, result: (await run()) ?? null });
    } catch (error) {
      return Response.json({ ok: false, error: String(error?.message ?? error) });
    }
  }
};`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
