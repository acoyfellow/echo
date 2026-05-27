/**
 * Preflight — one rule only.
 *
 * The per-verb preflight from echo-v0 is gone. Codex's model (the
 * authenticated browser belongs to the agent for the session lifetime)
 * means we don't need per-call gates. The browser enforces same-origin
 * automatically because the content script runs in the tab's realm and
 * can only fetch its own origin.
 *
 * The only thing the worker checks before forwarding:
 *   1. there's a code string
 *   2. it's not absurdly large
 */

import type { ExecuteArgs } from "./types";

const DEFAULT_MAX_CODE_BYTES = 64 * 1024;

export function preflightExecute(args: unknown, maxBytes = DEFAULT_MAX_CODE_BYTES): { error: string; detail?: string } | null {
  const a = (args ?? {}) as ExecuteArgs;
  if (typeof a.code !== "string" || a.code.length === 0) {
    return { error: "code_required" };
  }
  if (a.code.length > maxBytes) {
    return { error: "code_too_large", detail: `${a.code.length} > ${maxBytes}` };
  }
  return null;
}
