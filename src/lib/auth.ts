const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "123456";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export const AUTH_COOKIE_NAME = "aibox_dashboard_session";
export const AUTH_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;

export type AuthSession = {
  username: string;
  expiresAt: number;
};

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function getExpectedUsername(): string {
  return process.env.AIBOX_ADMIN_USERNAME?.trim() || DEFAULT_USERNAME;
}

function getExpectedPassword(): string {
  return process.env.AIBOX_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
}

function getSessionSecret(): string {
  return process.env.AIBOX_AUTH_SECRET || `${getExpectedUsername()}:${getExpectedPassword()}:aibox-dashboard-session-v1`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64UrlEncodeText(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecodeText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  try {
    return await crypto.subtle.verify("HMAC", key, toArrayBuffer(base64UrlToBytes(signature)), new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SessionPayload>;
  return typeof payload.username === "string" && typeof payload.expiresAt === "number";
}

export function validateCredentials(username: string, password: string): boolean {
  return username.trim() === getExpectedUsername() && password === getExpectedPassword();
}

export async function createSessionCookieValue(username: string, now = Date.now()): Promise<string> {
  const payload = base64UrlEncodeText(JSON.stringify({ username, expiresAt: now + SESSION_TTL_MS }));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function readSessionCookie(cookieValue: string | undefined, now = Date.now()): Promise<AuthSession | null> {
  if (!cookieValue) return null;

  const [payloadValue, signature, extra] = cookieValue.split(".");
  if (!payloadValue || !signature || extra) return null;
  if (!(await verifySignature(payloadValue, signature))) return null;

  try {
    const parsed = JSON.parse(base64UrlDecodeText(payloadValue)) as unknown;
    if (!isSessionPayload(parsed) || parsed.expiresAt <= now) return null;
    return { username: parsed.username, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, "https://aibox.local");
    if (parsed.origin !== "https://aibox.local" || parsed.pathname === "/login") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
