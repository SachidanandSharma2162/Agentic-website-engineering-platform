import { LIMITS, type AdminClassView, type ClassInput, type ClassView } from "../../shared/schema.ts";
import { ServiceError } from "../errors.ts";
import type { Ctx } from "./context.ts";

const DAY = 86_400_000;

interface ClassRow {
  id: string;
  title: string;
  starts_at: number;
  duration_min: number;
  capacity: number;
  cancelled: number;
  booked: number;
}

const toView = (r: ClassRow): ClassView => ({
  id: r.id,
  title: r.title,
  startsAt: r.starts_at,
  durationMin: r.duration_min,
  capacity: r.capacity,
  spotsLeft: Math.max(0, r.capacity - r.booked),
  cancelled: r.cancelled === 1,
});

const SELECT = `SELECT c.id, c.title, c.starts_at, c.duration_min, c.capacity, c.cancelled,
  (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id) AS booked FROM classes c`;

/** Classes starting within the booking window (the next 14 days), soonest first. */
export async function listClasses(ctx: Ctx): Promise<ClassView[]> {
  const from = ctx.now();
  const rows = await ctx.db.all<ClassRow>(`${SELECT} WHERE c.starts_at >= ?1 AND c.starts_at < ?2 ORDER BY c.starts_at, c.title, c.id`, [from, from + LIMITS.bookingWindowDays * DAY]);
  return rows.map(toView);
}

export async function getClass(ctx: Ctx, id: string): Promise<ClassView | null> {
  const row = await ctx.db.first<ClassRow>(`${SELECT} WHERE c.id = ?1`, [id]);
  return row ? toView(row) : null;
}

export async function createClass(ctx: Ctx, input: ClassInput): Promise<ClassView> {
  const now = ctx.now();
  if (input.startsAt <= now) throw new ServiceError("validation", 400, "The class must start in the future.", { fields: { startsAt: "The class must start in the future." } });
  if (input.startsAt > now + 366 * DAY) throw new ServiceError("validation", 400, "That is too far ahead.", { fields: { startsAt: "Classes can be added up to a year ahead." } });
  const id = crypto.randomUUID();
  await ctx.db.run("INSERT INTO classes (id, title, starts_at, duration_min, capacity, cancelled, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)", [
    id, input.title, input.startsAt, input.durationMin, input.capacity, now,
  ]);
  return { id, title: input.title, startsAt: input.startsAt, durationMin: input.durationMin, capacity: input.capacity, spotsLeft: input.capacity, cancelled: false };
}

/** Marks a class cancelled. Its bookings stay in the roster so the owner can see who to tell. Safe to repeat. */
export async function cancelClass(ctx: Ctx, id: string): Promise<void> {
  const r = await ctx.db.run("UPDATE classes SET cancelled = 1 WHERE id = ?1", [id]);
  if (r.changes === 0) throw new ServiceError("class_not_found", 404, "That class does not exist.");
}

/**
 * Owner view: classes from yesterday up to 60 days ahead, with their rosters. The window keeps the page (and the database
 * reads) small for a studio that schedules far ahead. This is the only place names and emails leave the database.
 */
export async function listAdminClasses(ctx: Ctx): Promise<AdminClassView[]> {
  const since = ctx.now() - DAY;
  const until = ctx.now() + LIMITS.adminWindowDays * DAY;
  const rows = await ctx.db.all<ClassRow>(`${SELECT} WHERE c.starts_at >= ?1 AND c.starts_at < ?2 ORDER BY c.starts_at, c.title, c.id`, [since, until]);
  const people = await ctx.db.all<{ class_id: string; name: string; email: string }>(
    "SELECT class_id, name, email FROM bookings WHERE class_id IN (SELECT id FROM classes WHERE starts_at >= ?1 AND starts_at < ?2) ORDER BY created_at, rowid", [since, until],
  );
  const byClass = new Map<string, { name: string; email: string }[]>();
  for (const p of people) (byClass.get(p.class_id) ?? byClass.set(p.class_id, []).get(p.class_id)!).push({ name: p.name, email: p.email });
  return rows.map((r) => ({ ...toView(r), roster: byClass.get(r.id) ?? [] }));
}
