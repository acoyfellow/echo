/**
 * Verb preflight — fast, deterministic rejects before any RPC happens.
 *
 * Carried over from echo-v0/worker/session.ts. The rules are the same;
 * the call site moved to EchoAgent.invokeTab.
 */

import { resolvePathAgainstOrigin } from "./auth";
import type { Verb, FetchArgs, ReadArgs, AskArgs } from "./types";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export function preflight(verb: Verb, args: unknown, origin: string | null): { error: string; detail?: string } | null {
  if (!origin) return { error: "session_unbound" };

  if (verb === "fetch") {
    const a = (args ?? {}) as FetchArgs;
    if (!a.path) return { error: "path_required" };
    const resolved = resolvePathAgainstOrigin(origin, a.path);
    if (!resolved) return { error: "cross_origin_blocked", detail: `pinned to ${origin}` };
    const method = (a.method ?? "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) return { error: "method_not_allowed", detail: method };
    return null;
  }

  if (verb === "read") {
    const a = (args ?? {}) as ReadArgs;
    if (!a.selector) return { error: "selector_required" };
    if (a.selector.length > 2000) return { error: "selector_too_long" };
    if (typeof a.shape !== "object" || !a.shape) return { error: "shape_required" };
    return null;
  }

  if (verb === "ask") {
    const a = (args ?? {}) as AskArgs;
    if (!a.prompt) return { error: "prompt_required" };
    if (a.prompt.length > 4000) return { error: "prompt_too_long" };
    return null;
  }

  return { error: "unknown_verb" };
}
