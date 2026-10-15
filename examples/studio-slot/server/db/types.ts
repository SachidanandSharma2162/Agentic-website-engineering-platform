/** The small slice of a SQL database the services need. D1 in production, real SQLite (node:sqlite) in tests and the dev server. */
export type Param = string | number | null;

export interface Db {
  run(sql: string, params?: readonly Param[]): Promise<{ changes: number }>;
  first<T = Record<string, unknown>>(sql: string, params?: readonly Param[]): Promise<T | null>;
  all<T = Record<string, unknown>>(sql: string, params?: readonly Param[]): Promise<T[]>;
}
