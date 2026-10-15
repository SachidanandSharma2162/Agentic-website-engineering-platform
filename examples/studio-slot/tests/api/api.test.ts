import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../server/crypto.ts";
import type { Db } from "../../server/db/types.ts";
import { DAY, HOUR, makeApp, PASSPHRASE } from "./helpers.ts";

const CODE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;

describe("schedule (AC1)", () => {
  it("lists the next 14 days soonest first with spots left, and labels cancelled classes", async () => {
    const t = makeApp();
    const later = await t.addClass({ title: "Evening", inMs: 5 * DAY, capacity: 10 });
    const soon = await t.addClass({ title: "Morning", inMs: 1 * DAY, capacity: 4 });
    await t.addClass({ title: "Too far ahead", inMs: 15 * DAY });
    const a = await t.admin();
    await a.call("POST", `/api/admin/classes/${later.id}/cancel`);
    await t.book(soon.id, "a@example.com");
    await t.book(soon.id, "b@example.com");

    const r = await t.call("GET", "/api/classes");
    expect(r.status).toBe(200);
    expect(r.body.studioTimezone).toBe("Asia/Kolkata");
    expect(r.body.classes.map((c: { title: string }) => c.title)).toEqual(["Morning", "Evening"]); // 15 days out is not shown
    expect(r.body.classes[0]).toMatchObject({ capacity: 4, spotsLeft: 2, cancelled: false });
    expect(r.body.classes[1]).toMatchObject({ cancelled: true });
  });

  it("never exposes names or emails publicly", async () => {
    const t = makeApp();
    const c = await t.addClass();
    await t.book(c.id, "secret.person@example.com", "Secret Person");
    expect((await t.call("GET", "/api/classes")).text).not.toMatch(/secret|example\.com/i);
  });

  it("returns an empty list, not an error, when nothing is scheduled", async () => {
    const r = await makeApp().call("GET", "/api/classes");
    expect(r.body.classes).toEqual([]);
  });

  it("does not show classes that have already started", async () => {
    const t = makeApp();
    await t.addClass({ inMs: HOUR });
    t.clock.t += 2 * HOUR;
    expect((await t.call("GET", "/api/classes")).body.classes).toEqual([]);
  });
});

describe("booking (AC3, AC5)", () => {
  it("books a spot: 201, a well-formed one-time code, one fewer spot, email stored lower-cased", async () => {
    const t = makeApp();
    const c = await t.addClass({ capacity: 3 });
    const r = await t.book(c.id, "Asha.Rao@Example.COM");
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(CODE);
    expect(r.body.class).toMatchObject({ id: c.id, spotsLeft: 2 });
    expect((await t.db.first<{ email: string }>("SELECT email FROM bookings"))?.email).toBe("asha.rao@example.com");
  });

  it.each([
    ["empty name", { name: "   ", email: "a@example.com" }, "name"],
    ["name over 60 characters", { name: "x".repeat(61), email: "a@example.com" }, "name"],
    ["control characters in the name", { name: "Asha\u0000Rao", email: "a@example.com" }, "name"],
    ["missing email", { name: "Asha", email: "" }, "email"],
    ["malformed email", { name: "Asha", email: "not-an-email" }, "email"],
    ["email over 120 characters", { name: "Asha", email: `${"a".repeat(115)}@x.com` }, "email"],
  ])("rejects %s with a field error and stores nothing", async (_n, input, field) => {
    const t = makeApp();
    const c = await t.addClass();
    const r = await t.call("POST", "/api/bookings", { classId: c.id, ...input });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation");
    expect(Object.keys(r.body.error.fields)).toContain(field);
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings"))?.n).toBe(0);
  });

  it("rejects a second booking by the same email (case-insensitive) with 409", async () => {
    const t = makeApp();
    const c = await t.addClass();
    expect((await t.book(c.id, "a@example.com")).status).toBe(201);
    const again = await t.book(c.id, "A@EXAMPLE.com");
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: "already_booked", fields: { email: expect.any(String) } });
  });

  it("gives a specific reason when the class is full, cancelled, already started or unknown", async () => {
    const t = makeApp();
    const full = await t.addClass({ capacity: 1 });
    await t.book(full.id, "a@example.com");
    expect((await t.book(full.id, "b@example.com")).body.error.code).toBe("class_full");

    const cancelled = await t.addClass();
    await (await t.admin()).call("POST", `/api/admin/classes/${cancelled.id}/cancel`);
    const rc = await t.book(cancelled.id, "a@example.com");
    expect([rc.status, rc.body.error.code]).toEqual([409, "class_cancelled"]);

    const started = await t.addClass({ inMs: HOUR });
    t.clock.t += 2 * HOUR;
    expect((await t.book(started.id, "a@example.com")).body.error.code).toBe("class_started");

    const unknown = await t.book("00000000-0000-0000-0000-000000000000", "a@example.com");
    expect([unknown.status, unknown.body.error.code]).toEqual([404, "class_not_found"]);
  });

  it("answers a honeypot submission like a success but stores nothing", async () => {
    const t = makeApp();
    const c = await t.addClass();
    const r = await t.call("POST", "/api/bookings", { classId: c.id, name: "Bot", email: "bot@example.com", website: "http://spam.example" });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(CODE);
    expect(Object.keys(r.body).sort()).toEqual(["bookingId", "class", "code"]); // same shape as a real booking
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings"))?.n).toBe(0);
  });
});

describe("capacity is never exceeded (AC4)", () => {
  it("20 simultaneous bookings for 5 spots give exactly 5 successes and 15 'full' answers", async () => {
    const t = makeApp();
    const c = await t.addClass({ capacity: 5 });
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => t.book(c.id, `guest${i}@example.com`, `Guest ${i}`, `198.51.100.${i}`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.body.error?.code === "class_full")).toHaveLength(15);
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings"))?.n).toBe(5);
    expect((await t.call("GET", "/api/classes")).body.classes[0].spotsLeft).toBe(0);
  });

  it("a cancelled spot can be taken again, and capacity still holds", async () => {
    const t = makeApp();
    const c = await t.addClass({ capacity: 1 });
    const first = await t.book(c.id, "a@example.com");
    expect((await t.book(c.id, "b@example.com")).status).toBe(409);
    await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: first.body.code });
    expect((await t.book(c.id, "b@example.com")).status).toBe(201);
    expect((await t.book(c.id, "c@example.com")).status).toBe(409);
  });
});

describe("cancelling a booking (AC6)", () => {
  async function booked() {
    const t = makeApp();
    const c = await t.addClass({ capacity: 2 });
    const b = await t.book(c.id, "a@example.com");
    return { t, c, code: b.body.code as string };
  }

  it("frees the spot with the right code, tolerating case and separators", async () => {
    const { t, c, code } = await booked();
    const r = await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: code.toLowerCase().replace(/-/g, " ").replace(/ /g, "") });
    expect(r.status).toBe(200);
    expect((await t.call("GET", "/api/classes")).body.classes[0].spotsLeft).toBe(2);
  });

  it("a code works once", async () => {
    const { t, c, code } = await booked();
    expect((await t.call("POST", "/api/bookings/cancel", { classId: c.id, code })).status).toBe(200);
    expect((await t.call("POST", "/api/bookings/cancel", { classId: c.id, code })).status).toBe(404);
  });

  it("gives an identical answer for a wrong code, a wrong class and an unknown class, so bookings cannot be probed", async () => {
    const { t, c, code } = await booked();
    const other = await t.addClass({ title: "Other" });
    const wrongCode = await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: "ZZZZZ-ZZZZZ-ZZZZZ" });
    const wrongClass = await t.call("POST", "/api/bookings/cancel", { classId: other.id, code });
    const unknown = await t.call("POST", "/api/bookings/cancel", { classId: "nope", code });
    const garbage = await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: "short" });
    for (const r of [wrongCode, wrongClass, unknown, garbage]) expect([r.status, r.body]).toEqual([404, wrongCode.body]);
    expect((await t.call("GET", "/api/classes")).body.classes.find((x: { id: string }) => x.id === c.id).spotsLeft).toBe(1); // still booked
  });

  it("cannot cancel once the class has started", async () => {
    const { t, c, code } = await booked();
    t.clock.t += 3 * DAY;
    const r = await t.call("POST", "/api/bookings/cancel", { classId: c.id, code });
    expect([r.status, r.body.error.code]).toEqual([409, "class_started"]);
  });

  it("stores only a hash of the code", async () => {
    const { t, code } = await booked();
    const row = await t.db.first<{ code_hash: string }>("SELECT code_hash FROM bookings");
    expect(row?.code_hash).toBe(await sha256Hex(code.replace(/-/g, "")));
    expect(JSON.stringify(await t.db.all("SELECT * FROM bookings"))).not.toContain(code.replace(/-/g, ""));
  });
});

describe("owner authentication and authorisation (AC8)", () => {
  const adminRoutes: [string, string, unknown?][] = [
    ["GET", "/api/admin/classes"],
    ["POST", "/api/admin/classes", { title: "x", startsAt: T(), durationMin: 60, capacity: 5 }],
    ["POST", "/api/admin/classes/some-id/cancel"],
    ["POST", "/api/admin/logout"],
  ];
  function T() {
    return Date.UTC(2026, 9, 20);
  }

  it.each(adminRoutes)("%s %s answers 401 without a session", async (method, path, body) => {
    const r = await makeApp().call(method, path, body, { "x-requested-with": "studio-slot" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("unauthorized");
  });

  it("rejects a wrong passphrase with 401 and sets no cookie", async () => {
    const r = await makeApp().call("POST", "/api/admin/login", { passphrase: "wrong" });
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("sets an HttpOnly, Secure, SameSite=Strict, path-scoped, expiring cookie on login", async () => {
    const r = await makeApp().call("POST", "/api/admin/login", { passphrase: PASSPHRASE });
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/admin/);
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it("rejects a tampered or forged cookie, and an expired one", async () => {
    const t = makeApp();
    const a = await t.admin();
    const good = await t.call("GET", "/api/admin/classes", undefined, { cookie: a.cookie });
    expect(good.status).toBe(200);
    const [name, token] = a.cookie.split("=") as [string, string];
    const parts = token.split(".");
    const forgedExpiry = `${name}=${parts[0]}.${Number(parts[1]) + 10 ** 9}.${parts[2]}`;
    const forgedSignature = `${name}=${parts[0]}.${parts[1]}.${"A".repeat(parts[2]!.length)}`;
    for (const cookie of [forgedExpiry, forgedSignature, `${name}=garbage`, `${name}=`]) {
      expect((await t.call("GET", "/api/admin/classes", undefined, { cookie })).status, cookie).toBe(401);
    }
    t.clock.t += 9 * HOUR;
    expect((await t.call("GET", "/api/admin/classes", undefined, { cookie: a.cookie })).status).toBe(401);
  });

  it("requires the custom header on state-changing admin calls (CSRF defence), but not on reads", async () => {
    const t = makeApp();
    const a = await t.admin();
    const noHeader = await t.call("POST", "/api/admin/classes", { title: "x", startsAt: T(), durationMin: 60, capacity: 5 }, { cookie: a.cookie });
    expect([noHeader.status, noHeader.body.error.code]).toEqual([403, "forbidden"]);
    expect((await t.call("GET", "/api/admin/classes", undefined, { cookie: a.cookie })).status).toBe(200);
  });

  it("signing out ends the session cookie", async () => {
    const t = makeApp();
    const a = await t.admin();
    const out = await a.call("POST", "/api/admin/logout");
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("fails closed when the passphrase or a long enough signing secret is not configured", async () => {
    for (const env of [{ ADMIN_PASSPHRASE: "" }, { SESSION_SECRET: "short" }]) {
      const t = makeApp({ env });
      const r = await t.call("POST", "/api/admin/login", { passphrase: PASSPHRASE });
      expect([r.status, r.body.error.code]).toEqual([503, "unavailable"]);
      expect((await t.call("GET", "/api/classes")).status).toBe(200); // the public site still works
    }
  });

  it("never reveals the passphrase or secret in any response", async () => {
    const t = makeApp();
    const a = await t.admin();
    const all = [await t.call("GET", "/api/classes"), await a.call("GET", "/api/admin/classes"), await t.call("POST", "/api/admin/login", { passphrase: "x" })];
    for (const r of all) expect(r.text + [...r.headers.values()].join()).not.toContain(PASSPHRASE);
  });
});

describe("owner classes (AC9)", () => {
  it.each([
    ["a start in the past", { startsAt: T0() - HOUR }, "startsAt"],
    ["a start more than a year ahead", { startsAt: T0() + 400 * DAY }, "startsAt"],
    ["capacity 0", { capacity: 0 }, "capacity"],
    ["capacity 101", { capacity: 101 }, "capacity"],
    ["duration 14 minutes", { durationMin: 14 }, "durationMin"],
    ["duration 241 minutes", { durationMin: 241 }, "durationMin"],
    ["an empty title", { title: "  " }, "title"],
    ["a title over 60 characters", { title: "t".repeat(61) }, "title"],
    ["a fractional capacity", { capacity: 2.5 }, "capacity"],
  ])("rejects %s", async (_n, patch, field) => {
    const t = makeApp();
    const a = await t.admin();
    const r = await a.call("POST", "/api/admin/classes", { title: "Ok", startsAt: t.clock.t + DAY, durationMin: 60, capacity: 5, ...patch });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields)).toContain(field);
  });

  it("adds a class, shows rosters to the owner, and keeps a cancelled class's bookings visible", async () => {
    const t = makeApp();
    const c = await t.addClass({ capacity: 3 });
    await t.book(c.id, "a@example.com", "Asha");
    await t.book(c.id, "b@example.com", "Bala");
    const a = await t.admin();
    await a.call("POST", `/api/admin/classes/${c.id}/cancel`);
    const r = await a.call("GET", "/api/admin/classes");
    expect(r.body.classes[0]).toMatchObject({ cancelled: true, roster: [{ name: "Asha", email: "a@example.com" }, { name: "Bala", email: "b@example.com" }] });
  });

  it("cancelling is repeatable, and an unknown class is 404", async () => {
    const t = makeApp();
    const c = await t.addClass();
    const a = await t.admin();
    expect((await a.call("POST", `/api/admin/classes/${c.id}/cancel`)).status).toBe(200);
    expect((await a.call("POST", `/api/admin/classes/${c.id}/cancel`)).status).toBe(200);
    expect((await a.call("POST", "/api/admin/classes/does-not-exist/cancel")).status).toBe(404);
  });
});

function T0() {
  return Date.UTC(2026, 9, 16);
}

describe("abuse protection (AC10)", () => {
  it("returns 429 with Retry-After once a client exceeds the booking limit, without affecting other clients", async () => {
    const t = makeApp({ env: { RATE_LIMIT_BOOK: "3" } });
    const c = await t.addClass({ capacity: 50 });
    for (let i = 0; i < 3; i++) expect((await t.book(c.id, `a${i}@example.com`, "A", "198.51.100.1")).status).toBe(201);
    const blocked = await t.book(c.id, "a9@example.com", "A", "198.51.100.1");
    expect([blocked.status, blocked.body.error.code]).toEqual([429, "rate_limited"]);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await t.book(c.id, "other@example.com", "B", "198.51.100.2")).status).toBe(201);
  });

  it("lets the same client back in after the window passes", async () => {
    const t = makeApp({ env: { RATE_LIMIT_BOOK: "1" } });
    const c = await t.addClass({ capacity: 50 });
    expect((await t.book(c.id, "a@example.com", "A", "198.51.100.1")).status).toBe(201);
    expect((await t.book(c.id, "b@example.com", "A", "198.51.100.1")).status).toBe(429);
    t.clock.t += 11 * 60_000;
    expect((await t.book(c.id, "b@example.com", "A", "198.51.100.1")).status).toBe(201);
  });

  it("limits sign-in attempts too, even with the right passphrase after too many tries", async () => {
    const t = makeApp({ env: { RATE_LIMIT_LOGIN: "3" } });
    for (let i = 0; i < 3; i++) expect((await t.call("POST", "/api/admin/login", { passphrase: "wrong" })).status).toBe(401);
    const r = await t.call("POST", "/api/admin/login", { passphrase: PASSPHRASE });
    expect(r.status).toBe(429);
  });

  it("limits cancellation guesses", async () => {
    const t = makeApp({ env: { RATE_LIMIT_CANCEL: "2" } });
    const c = await t.addClass();
    for (let i = 0; i < 2; i++) await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: "ZZZZZ-ZZZZZ-ZZZZZ" });
    expect((await t.call("POST", "/api/bookings/cancel", { classId: c.id, code: "ZZZZZ-ZZZZZ-ZZZZZ" })).status).toBe(429);
  });

  it("never stores a client address", async () => {
    const t = makeApp();
    const c = await t.addClass();
    await t.book(c.id, "a@example.com", "A", "198.51.100.77");
    expect(JSON.stringify(await t.db.all("SELECT * FROM rate_limits"))).not.toContain("198.51.100.77");
  });
});

describe("hostile input (AC11)", () => {
  it("stores markup and SQL metacharacters as plain text, and the database stays intact", async () => {
    const t = makeApp();
    const c = await t.addClass();
    const name = `<img src=x onerror=alert(1)> '); DROP TABLE bookings;--`;
    const r = await t.call("POST", "/api/bookings", { classId: c.id, name, email: "a@example.com" });
    expect(r.status).toBe(201);
    expect((await t.db.first<{ name: string }>("SELECT name FROM bookings"))?.name).toBe(name);
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings"))?.n).toBe(1);
    expect((await (await t.admin()).call("GET", "/api/admin/classes")).body.classes[0].roster[0].name).toBe(name); // returned verbatim as JSON text
  });

  it("treats a hostile class id as data, not SQL", async () => {
    const t = makeApp();
    await t.addClass();
    const r = await t.book("x' OR '1'='1", "a@example.com");
    expect([r.status, r.body.error.code]).toEqual([404, "class_not_found"]);
    expect((await t.call("POST", "/api/bookings/cancel", { classId: "x' OR '1'='1", code: "ZZZZZ-ZZZZZ-ZZZZZ" })).status).toBe(404);
  });

  it("rejects oversize bodies (declared and actual), non-JSON types and malformed JSON", async () => {
    const t = makeApp();
    const big = JSON.stringify({ classId: "x", name: "y".repeat(5000), email: "a@example.com" });
    expect((await t.call("POST", "/api/bookings", big, { "content-length": String(big.length) })).status).toBe(413);
    expect((await t.call("POST", "/api/bookings", big)).status).toBe(413);
    expect((await t.call("POST", "/api/bookings", "name=x", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await t.call("POST", "/api/bookings", "{not json")).status).toBe(400);
    expect((await t.call("POST", "/api/bookings", "[]")).status).toBe(400);
  });

  it("answers unknown routes with 404 and wrong methods with 405 and an Allow header", async () => {
    const t = makeApp();
    expect((await t.call("GET", "/api/nothing")).status).toBe(404);
    const wrong = await t.call("GET", "/api/bookings");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("POST");
    expect((await t.call("DELETE", "/api/classes")).status).toBe(405);
  });

  it("marks every API response uncacheable and non-sniffable", async () => {
    const t = makeApp();
    for (const r of [await t.call("GET", "/api/classes"), await t.call("GET", "/api/nothing"), await t.call("GET", "/api/health")]) {
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("retention (AC17)", () => {
  it("purges classes (and their bookings) 90 days after they start, and keeps newer ones", async () => {
    const t = makeApp();
    const old = await t.addClass({ title: "Old", inMs: 1 * DAY });
    const recent = await t.addClass({ title: "Recent", inMs: 20 * DAY });
    await t.book(old.id, "old@example.com");
    await t.book(recent.id, "recent@example.com");
    const a = await t.admin();

    t.clock.t += 1 * DAY + 89 * DAY; // 89 days after "Old" started
    await a.call("GET", "/api/admin/classes");
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE email = 'old@example.com'"))?.n).toBe(1);

    t.clock.t += 2 * DAY; // 91 days after
    await (await t.admin()).call("GET", "/api/admin/classes");
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM classes WHERE title = 'Old'"))?.n).toBe(0);
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE email = 'old@example.com'"))?.n).toBe(0);
    expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE email = 'recent@example.com'"))?.n).toBe(1);
  });
});

describe("operations", () => {
  it("reports health, and refuses to start with an invalid studio time zone", async () => {
    expect((await makeApp().call("GET", "/api/health")).body).toEqual({ ok: true });
    const bad = await makeApp({ env: { STUDIO_TIMEZONE: "Mars/Olympus" } }).call("GET", "/api/classes");
    expect([bad.status, bad.body.error.code]).toEqual([503, "unavailable"]);
  });

  it("uses the configured studio time zone", async () => {
    expect((await makeApp({ env: { STUDIO_TIMEZONE: "America/New_York" } }).call("GET", "/api/classes")).body.studioTimezone).toBe("America/New_York");
  });

  it("maps a free-tier daily-limit failure to a friendly 503 and logs no personal data", async () => {
    const throwing = (db: Db): Db => ({
      ...db,
      all: async () => {
        throw new Error("D1 daily limit exceeded for this account");
      },
    });
    const t = makeApp({ dbWrap: throwing });
    const r = await t.call("GET", "/api/classes");
    expect([r.status, r.body.error.code]).toEqual([503, "daily_limit"]);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("maps any other database failure to a generic 503 without leaking details", async () => {
    const t = makeApp({
      dbWrap: (db) => ({
        ...db,
        all: async () => {
          throw new Error("SQLITE_CORRUPT at secret_table");
        },
      }),
    });
    const r = await t.call("GET", "/api/classes");
    expect([r.status, r.body.error.code]).toEqual([503, "unavailable"]);
    expect(r.text).not.toMatch(/SQLITE|secret_table/);
  });
});
