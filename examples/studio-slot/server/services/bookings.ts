import type { BookingInput, CancelInput, ClassView } from "../../shared/schema.ts";
import { normalizeCode, randomCode, sha256Hex } from "../crypto.ts";
import { ServiceError } from "../errors.ts";
import { getClass } from "./classes.ts";
import type { Ctx } from "./context.ts";

/**
 * Capacity is enforced by the database in this single statement, never by "read the count, then insert":
 * the row is inserted only when the class exists, is not cancelled, has not started, and has a free spot, all evaluated
 * and applied atomically. SQLite serialises writers, so N concurrent requests for M spots yield exactly M inserts.
 * The UNIQUE (class_id, email) constraint turns a repeat booking into a conflict error.
 */
const ATOMIC_INSERT = `INSERT INTO bookings (id, class_id, name, email, code_hash, created_at)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6
  WHERE (SELECT cancelled FROM classes WHERE id = ?2) = 0
    AND (SELECT starts_at FROM classes WHERE id = ?2) > ?6
    AND (SELECT COUNT(*) FROM bookings WHERE class_id = ?2) < (SELECT capacity FROM classes WHERE id = ?2)`;

export interface BookingResult {
  bookingId: string;
  /** Shown to the visitor once; only its hash is stored. */
  code: string;
  class: ClassView;
}

export async function createBooking(ctx: Ctx, input: BookingInput): Promise<BookingResult> {
  const now = ctx.now();
  const code = randomCode();
  const bookingId = crypto.randomUUID();
  const email = input.email.toLowerCase();
  let changes: number;
  try {
    ({ changes } = await ctx.db.run(ATOMIC_INSERT, [bookingId, input.classId, input.name, email, await sha256Hex(normalizeCode(code)!), now]));
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed: bookings\.class_id, bookings\.email/i.test(e.message)) {
      throw new ServiceError("already_booked", 409, "This email already has a spot in this class.", { fields: { email: "This email already has a spot in this class." } });
    }
    throw e;
  }
  const cls = await getClass(ctx, input.classId);
  if (changes === 1 && cls) return { bookingId, code, class: cls };

  // Nothing was inserted: say exactly why.
  if (!cls) throw new ServiceError("class_not_found", 404, "That class does not exist.");
  if (cls.cancelled) throw new ServiceError("class_cancelled", 409, "This class has been cancelled.");
  if (cls.startsAt <= now) throw new ServiceError("class_started", 409, "This class has already started.");
  throw new ServiceError("class_full", 409, "Sorry, that class just filled up.");
}

/**
 * Cancels by class and code. A wrong code, a wrong class and an unknown class all give the same answer, so nobody can
 * probe which bookings exist. A code works once: the booking row is deleted.
 */
export async function cancelBooking(ctx: Ctx, input: CancelInput): Promise<void> {
  const notFound = new ServiceError("not_found", 404, "We couldn't find a booking with that class and code.");
  const normalized = normalizeCode(input.code);
  if (!normalized) throw notFound;
  const cls = await getClass(ctx, input.classId);
  if (!cls) throw notFound;
  const hash = await sha256Hex(normalized);
  const exists = await ctx.db.first("SELECT 1 AS x FROM bookings WHERE class_id = ?1 AND code_hash = ?2", [input.classId, hash]);
  if (!exists) throw notFound;
  if (cls.startsAt <= ctx.now()) throw new ServiceError("class_started", 409, "This class has already started, so it can no longer be cancelled here.");
  const r = await ctx.db.run("DELETE FROM bookings WHERE class_id = ?1 AND code_hash = ?2", [input.classId, hash]);
  if (r.changes !== 1) throw notFound; // someone else used the code in the meantime
}
