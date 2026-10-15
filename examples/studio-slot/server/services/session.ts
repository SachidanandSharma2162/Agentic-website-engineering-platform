import { hmacSign, safeEqual } from "../crypto.ts";
import type { Config } from "../config.ts";

export const SESSION_COOKIE = "studio_admin";
export const SESSION_SECONDS = 8 * 3600;

/** "v1.<expiry>.<signature>": an expiring token signed with the server secret. No data about the owner is inside it. */
export async function createSessionCookie(config: Config, nowMs: number): Promise<string> {
  const expiry = nowMs + SESSION_SECONDS * 1000;
  const payload = `v1.${expiry}`;
  const token = `${payload}.${await hmacSign(config.sessionSecret!, payload)}`;
  // Scoped to the admin API so it is never sent with public requests; HttpOnly keeps scripts from reading it.
  return `${SESSION_COOKIE}=${token}; Path=/api/admin; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Strict${config.cookieSecure ? "; Secure" : ""}`;
}

export function clearSessionCookie(config: Config): string {
  return `${SESSION_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; SameSite=Strict${config.cookieSecure ? "; Secure" : ""}`;
}

export async function hasValidSession(config: Config, cookieHeader: string | null, nowMs: number): Promise<boolean> {
  if (!config.sessionSecret || !cookieHeader) return false;
  const raw = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const token = raw?.slice(SESSION_COOKIE.length + 1);
  const m = token ? /^(v1\.(\d{10,16}))\.([A-Za-z0-9_-]{20,64})$/.exec(token) : null;
  if (!m) return false;
  const [, payload, expiry, signature] = m as unknown as [string, string, string, string];
  if (Number(expiry) <= nowMs) return false;
  return safeEqual(signature, await hmacSign(config.sessionSecret, payload));
}

export async function passphraseMatches(config: Config, given: string): Promise<boolean> {
  return config.adminPassphrase !== null && safeEqual(given, config.adminPassphrase);
}
