import { DEFAULT_STUDIO_TZ, isValidTimeZone } from "../shared/time.ts";
import type { D1Like } from "./db/d1.ts";

/** Bindings and secrets supplied by the platform (Pages) or by the dev server. */
export interface Env {
  DB: D1Like;
  /** Secret: the owner's passphrase. Without it every admin route fails closed. */
  ADMIN_PASSPHRASE?: string;
  /** Secret: signs admin session cookies. */
  SESSION_SECRET?: string;
  /** IANA zone of the studio. Defaults to Asia/Kolkata. */
  STUDIO_TIMEZONE?: string;
  /** "1" only for plain-http local development, where a Secure cookie would not be accepted by every browser. */
  COOKIE_INSECURE?: string;
  RATE_LIMIT_BOOK?: string;
  RATE_LIMIT_CANCEL?: string;
  RATE_LIMIT_LOGIN?: string;
}

export interface Config {
  studioTz: string;
  adminPassphrase: string | null;
  sessionSecret: string | null;
  cookieSecure: boolean;
  limits: { book: number; cancel: number; login: number };
}

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Returns the effective configuration, or the problem (the API then answers 503 instead of guessing). */
export function resolveConfig(env: Env): { ok: true; config: Config } | { ok: false; problem: string } {
  const studioTz = env.STUDIO_TIMEZONE?.trim() || DEFAULT_STUDIO_TZ;
  if (!isValidTimeZone(studioTz)) return { ok: false, problem: `STUDIO_TIMEZONE "${studioTz}" is not a valid IANA time zone` };
  return {
    ok: true,
    config: {
      studioTz,
      adminPassphrase: env.ADMIN_PASSPHRASE || null,
      sessionSecret: env.SESSION_SECRET && env.SESSION_SECRET.length >= 16 ? env.SESSION_SECRET : null,
      cookieSecure: env.COOKIE_INSECURE !== "1",
      // Per client address: bookings per 10 minutes, cancellations per 10 minutes, sign-in attempts per 10 minutes.
      limits: { book: int(env.RATE_LIMIT_BOOK, 10), cancel: int(env.RATE_LIMIT_CANCEL, 20), login: int(env.RATE_LIMIT_LOGIN, 8) },
    },
  };
}
