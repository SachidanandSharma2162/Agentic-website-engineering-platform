import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../server/db/sqlite.ts";
import { MIGRATIONS } from "./helpers.ts";

const CHILD = fileURLToPath(new URL("./fixtures/book-child.ts", import.meta.url));
let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "studio-slot-race-")));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function attempt(dbFile: string, classId: string, email: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD, dbFile, classId, email], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", () => {
      try {
        resolve((JSON.parse(out.trim().split("\n").pop() ?? "{}") as { outcome: string }).outcome);
      } catch {
        resolve(`CRASH: ${err.slice(0, 200)}`);
      }
    });
  });
}

describe("capacity under real concurrency (AC4)", () => {
  it("16 separate processes with separate database connections racing for 5 spots: exactly 5 win, the rest are told the class is full", async () => {
    const dbFile = join(dir, "race.db");
    const setup = openDatabase(dbFile, MIGRATIONS);
    setup.prepare("INSERT INTO classes (id, title, starts_at, duration_min, capacity, cancelled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run("c1", "Race", Date.UTC(2026, 9, 20), 60, 5, 0);
    setup.close();

    const outcomes = await Promise.all(Array.from({ length: 16 }, (_, i) => attempt(dbFile, "c1", `racer${i}@example.com`)));
    const tally = outcomes.reduce<Record<string, number>>((m, o) => ({ ...m, [o]: (m[o] ?? 0) + 1 }), {});
    expect(tally).toEqual({ booked: 5, class_full: 11 }); // nothing else: no crashes, no "database is locked", no overbooking

    const verify = new DatabaseSync(dbFile);
    expect(verify.prepare("SELECT COUNT(*) AS n FROM bookings WHERE class_id = 'c1'").get()).toEqual({ n: 5 });
    verify.close();
  }, 90_000);

  it("two processes racing for the same email on the same class: one booking, one 'already booked'", async () => {
    const dbFile = join(dir, "dup.db");
    const setup = openDatabase(dbFile, MIGRATIONS);
    setup.prepare("INSERT INTO classes (id, title, starts_at, duration_min, capacity, cancelled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run("c1", "Dup", Date.UTC(2026, 9, 20), 60, 5, 0);
    setup.close();
    const outcomes = (await Promise.all([attempt(dbFile, "c1", "same@example.com"), attempt(dbFile, "c1", "same@example.com")])).sort();
    expect(outcomes).toEqual(["already_booked", "booked"]);
  }, 60_000);
});
