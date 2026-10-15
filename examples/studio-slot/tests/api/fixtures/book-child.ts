// One OS process, one database connection, one booking attempt. Run many at once to race for the last spots.
// Usage: node book-child.ts <dbFile> <classId> <email>
import { DatabaseSync } from "node:sqlite";
import { resolveConfig } from "../../../server/config.ts";
import { sqliteDb } from "../../../server/db/sqlite.ts";
import { ServiceError } from "../../../server/errors.ts";
import { createBooking } from "../../../server/services/bookings.ts";

const [dbFile, classId, email] = process.argv.slice(2) as [string, string, string];
const raw = new DatabaseSync(dbFile);
raw.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
const cfg = resolveConfig({ DB: undefined as never });
if (!cfg.ok) throw new Error(cfg.problem);

try {
  await createBooking({ db: sqliteDb(raw), now: () => Date.UTC(2026, 9, 16), config: cfg.config }, { classId, name: "Racer", email });
  console.log(JSON.stringify({ outcome: "booked" }));
} catch (e) {
  console.log(JSON.stringify({ outcome: e instanceof ServiceError ? e.code : `ERROR: ${e instanceof Error ? e.message : String(e)}` }));
}
