const encoder = new TextEncoder();

const decoder = new TextDecoder();

export type CapabilityKind = "mcp" | "page" | "worker";

import { capabilityGrants, type CapabilityGrant } from "./schema";

export type { CapabilityGrant };

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

  return encodeBase64Url(new Uint8Array(signature));
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;

  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);

  return difference === 0;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let value = "";

  for (const byte of bytes) value += String.fromCharCode(byte);

  return btoa(value).replace(/=+$/, "").replace(/\+/g, "-").split("/").join("_");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);

  return atob(padded);
}

function normalizeGrants(grants: CapabilityGrant[]): CapabilityGrant[] {
  return [...grants].sort((left, right) => left.name.localeCompare(right.name));
}

async function mintCapability(
  secret: string,
  kind: CapabilityKind,
  id: string,
  origin: string,
  appId: string,
  grants: CapabilityGrant[],
  expiresAt: number,
): Promise<string> {
  const encodedOrigin = encodeBase64Url(encoder.encode(origin));
  const encodedAppId = encodeBase64Url(encoder.encode(appId));
  const encodedGrants = encodeBase64Url(encoder.encode(JSON.stringify(normalizeGrants(grants))));
  const head = `${kind}.${id}.${encodedOrigin}.${encodedAppId}.${encodedGrants}.${expiresAt}`;

  return `${head}.${await sign(secret, head)}`;
}

export async function mintSessionCapabilities(
  secret: string,
  origin: string,
  lifetimeHours: number,
  appId: string,
  grants: CapabilityGrant[],
): Promise<{ id: string; mcpToken: string; pageToken: string; expiresAt: number }> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, lifetimeHours * 3600);

  return {
    id,
    mcpToken: await mintCapability(secret, "mcp", id, origin, appId, grants, expiresAt),
    pageToken: await mintCapability(secret, "page", id, origin, appId, grants, expiresAt),
    expiresAt,
  };
}

export async function mintWorkerCapability(
  secret: string,
  id: string,
  origin: string,
  expiresAt: number,
  appId: string,
  grants: CapabilityGrant[],
): Promise<string> {
  return mintCapability(secret, "worker", id, origin, appId, grants, expiresAt);
}

export async function verifyCapability(
  secret: string,
  signed: string,
  expectedKind: CapabilityKind,
): Promise<{
  id: string;
  origin: string;
  appId: string;
  grants: CapabilityGrant[];
  expiresAt: number;
} | null> {
  const parts = signed.split(".");

  if (parts.length !== 7) return null;
  const [kind, id, encodedOrigin, encodedAppId, encodedGrants, expiresAtText, signature] = parts;

  if (
    kind !== expectedKind ||
    !id ||
    !encodedOrigin ||
    !encodedAppId ||
    !encodedGrants ||
    !expiresAtText ||
    !signature
  )
    return null;
  const head = `${kind}.${id}.${encodedOrigin}.${encodedAppId}.${encodedGrants}.${expiresAtText}`;

  if (!equal(await sign(secret, head), signature)) return null;
  const expiresAt = Number(expiresAtText);

  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;

  try {
    const origin = decoder.decode(
      Uint8Array.from(decodeBase64Url(encodedOrigin), (character) => character.charCodeAt(0)),
    );

    const appId = decoder.decode(
      Uint8Array.from(decodeBase64Url(encodedAppId), (character) => character.charCodeAt(0)),
    );

    const grantsParse = capabilityGrants.safeParse(
      JSON.parse(
        decoder.decode(
          Uint8Array.from(decodeBase64Url(encodedGrants), (character) => character.charCodeAt(0)),
        ),
      ),
    );

    if (!grantsParse.success) return null;
    const grants = grantsParse.data;

    if (new URL(origin).origin !== origin || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(appId))
      return null;

    if (grants.length > 100) return null;

    return { id, origin, appId, grants: normalizeGrants(grants), expiresAt };
  } catch {
    return null;
  }
}
