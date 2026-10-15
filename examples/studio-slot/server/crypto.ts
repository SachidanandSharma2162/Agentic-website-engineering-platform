/** Small WebCrypto helpers (available in Node and in Workers). */

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

const b64url = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(message)));
}

/** Constant-time equality of two strings (compares digests so lengths do not leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const [xa, ya] = [new Uint8Array(x), new Uint8Array(y)];
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= (xa[i] ?? 0) ^ (ya[i] ?? 0);
  return diff === 0;
}

// 32 characters without the look-alikes I, O, 0 and 1, so a code read aloud or typed from a screenshot survives.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 15;

/** A random cancellation code like "K7QM2-X9PTA-4RWNE" (75 bits). */
export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const chars = [...bytes].map((b) => ALPHABET[b & 31]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10)}`;
}

/** Uppercase and drop separators, so "k7qm2 x9pta-4rwne" matches. Returns null when it cannot be a valid code. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}
