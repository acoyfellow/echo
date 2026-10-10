import { mintSessionCapabilities } from "./auth";
import { readBoundedBody } from "./body";
import { parseJson, sessionRequest } from "./schema";
import type { Env } from "./types";

function secureOrigin(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    const loopback =
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    return url.origin === value && (url.protocol === "https:" || loopback) ? url.origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function failure(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export function handleSessionPreflight(request: Request): Response {
  const origin = secureOrigin(request.headers.get("origin"));

  if (!origin) return new Response(null, { status: 403 });

  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  const text = await readBoundedBody(request, 4096);

  if (text === null) return failure("request_too_large", 413);
  const payload = parseJson(text);

  if (payload === undefined) return failure("bad_request", 400);
  const parsed = sessionRequest.safeParse(payload);

  if (!parsed.success) return failure("capabilities_invalid", 400);
  const body = parsed.data;
  const requestOrigin = secureOrigin(request.headers.get("origin"));

  if (!requestOrigin || requestOrigin !== body.origin)
    return failure("request_origin_mismatch", 403);
  const names = new Set(body.capabilities.map((grant) => grant.name));

  if (names.size !== body.capabilities.length) return failure("capability_duplicate", 400);
  const lifetimeHours = Math.max(1 / 60, Math.min(Number(env.ECHO_MAX_SESSION_HOURS || "1"), 1));

  const minted = await mintSessionCapabilities(
    env.ECHO_SIGNING_SECRET,
    requestOrigin,
    lifetimeHours,
    body.appId,
    body.capabilities,
  );

  return Response.json(
    { ...minted, origin: requestOrigin, lifetimeHours },
    { headers: corsHeaders(requestOrigin) },
  );
}
