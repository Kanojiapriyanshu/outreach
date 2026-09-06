const SESSION_COOKIE = "fidem_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

interface SessionPayload {
  userId: string;
  exp: number;
}

/** Edge-runtime-safe (uses Web Crypto, no Node-only APIs) so this can be checked in middleware. */
export async function createSessionToken(userId: string): Promise<string> {
  const payload: SessionPayload = { userId, exp: Date.now() + SESSION_TTL_MS };
  const payloadStr = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmac(payloadStr));
  return `${payloadStr}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<string | null> {
  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature) return null;

  const expectedSig = base64UrlEncode(await hmac(payloadStr));
  if (expectedSig !== signature) return null;

  try {
    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadStr)));
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };
