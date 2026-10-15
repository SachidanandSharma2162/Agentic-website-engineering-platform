import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db, Param } from "./types.ts";

/** A real SQLite database (the same engine D1 is built on). Used by tests and the local dev server. */
export function sqliteDb(db: DatabaseSync): Db {
  return {
    async run(sql, params = []) {
      return { changes: Number(db.prepare(sql).run(...params).changes) };
    },
    async first(sql, params = []) {
      return (db.prepare(sql).get(...params) as never) ?? null;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params) as never;
    },
  };
}

/** Open a database file (or ":memory:") and apply every numbered migration in order. */
export function openDatabase(path: string, migrationsDir: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  const files = readdirSync(migrationsDir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  for (const f of files) db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  return db;
}

export type { Param };
