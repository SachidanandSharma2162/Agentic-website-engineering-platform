import type { Db, Param } from "./types.ts";

/** The parts of Cloudflare's D1 binding this app uses (declared here so no platform types package is needed). */
export interface D1Statement {
  bind(...values: Param[]): D1Statement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
}

export function d1Db(d1: D1Like): Db {
  const stmt = (sql: string, params: readonly Param[] = []) => d1.prepare(sql).bind(...params);
  return {
    async run(sql, params) {
      const r = await stmt(sql, params).run();
      return { changes: r.meta.changes ?? 0 };
    },
    first: (sql, params) => stmt(sql, params).first() as Promise<never>,
    async all(sql, params) {
      return (await stmt(sql, params).all()).results as never;
    },
  };
}
