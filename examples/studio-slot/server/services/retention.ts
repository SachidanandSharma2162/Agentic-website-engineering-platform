import { LIMITS } from "../../shared/schema.ts";
import type { Ctx } from "./context.ts";

/**
 * Deletes classes that started more than 90 days ago; their bookings (names and emails) go with them through the
 * foreign-key cascade. Runs lazily when the owner opens the admin view, so no scheduled job is needed.
 */
export async function purgeExpired(ctx: Ctx): Promise<number> {
  const cutoff = ctx.now() - LIMITS.retentionDays * 86_400_000;
  return (await ctx.db.run("DELETE FROM classes WHERE starts_at < ?1", [cutoff])).changes;
}
