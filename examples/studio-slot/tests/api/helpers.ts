/* eslint-disable @typescript-eslint/no-explicit-any -- test helper: response bodies are inspected loosely on purpose */
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { handle } from "../../server/app.ts";
import type { Env } from "../../server/config.ts";
import type { Db } from "../../server/db/types.ts";
import { openDatabase, sqliteDb } from "../../server/db/sqlite.ts";

export const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
export const PASSPHRASE = "correct horse battery staple";
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Friday 16 Oct 2026, 00:00 UTC. */
export const T0 = Date.UTC(2026, 9, 16, 0, 0);

export interface Result<T = any> {
  status: number;
  headers: Headers;
  body: T;
  text: string;
}

export interface TestApp {
  raw: DatabaseSync;
  db: Db;
  clock: { t: number };
  env: Env;
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Result>;
  /** Sign in as the owner; returns a function that makes authorised admin calls. */
  admin(): Promise<{ call(method: string, path: string, body?: unknown): Promise<Result>; cookie: string }>;
  /** Owner shortcut: add a class starting `inMs` from now and return it. */
  addClass(over?: Partial<{ title: string; inMs: number; capacity: number; durationMin: number }>): Promise<{ id: string; startsAt: number }>;
  book(classId: string, email: string, name?: string, ip?: string): Promise<Result>;
}

export function makeApp(opts: { env?: Partial<Env>; dbWrap?: (db: Db) => Db } = {}): TestApp {
  const raw = openDatabase(":memory:", MIGRATIONS);
  const db = opts.dbWrap ? opts.dbWrap(sqliteDb(raw)) : sqliteDb(raw);
  const clock = { t: T0 };
  const env: Env = { DB: undefined as never, ADMIN_PASSPHRASE: PASSPHRASE, SESSION_SECRET: "s".repeat(32), ...opts.env };

  const call: TestApp["call"] = async (method, path, body, headers = {}) => {
    const init: RequestInit = { method, headers: { "cf-connecting-ip": "203.0.113.7", ...headers } };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] ??= "application/json";
    }
    const res = await handle(new Request(`https://studio.example${path}`, init), env, { db, now: () => clock.t });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, body: parsed, text };
  };

  const admin: TestApp["admin"] = async () => {
    const login = await call("POST", "/api/admin/login", { passphrase: PASSPHRASE });
    if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.text}`);
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
    return { cookie, call: (method, path, body) => call(method, path, body, { cookie, "x-requested-with": "studio-slot" }) };
  };

  return {
    raw, db, clock, env, call, admin,
    async addClass(over = {}) {
      const a = await admin();
      const startsAt = clock.t + (over.inMs ?? 2 * DAY);
      const r = await a.call("POST", "/api/admin/classes", { title: over.title ?? "Sunrise Vinyasa", startsAt, durationMin: over.durationMin ?? 60, capacity: over.capacity ?? 5 });
      if (r.status !== 201) throw new Error(`addClass failed: ${r.status} ${r.text}`);
      return { id: r.body.id, startsAt };
    },
    book: (classId, email, name = "Asha Rao", ip = "203.0.113.7") => call("POST", "/api/bookings", { classId, name, email }, { "cf-connecting-ip": ip }),
  };
}
