import type { Config } from "../config.ts";
import type { Db } from "../db/types.ts";

/** Everything a service needs; the clock is injected so time-dependent behaviour is testable. */
export interface Ctx {
  db: Db;
  /** Current time, epoch milliseconds. */
  now: () => number;
  config: Config;
}
