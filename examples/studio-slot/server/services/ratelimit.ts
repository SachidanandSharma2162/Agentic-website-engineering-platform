import { sha256Hex } from "../crypto.ts";
import { ServiceError } from "../errors.ts";
import type { Ctx } from "./context.ts";

export const WINDOW_SECONDS = 600;

/**
 * Fixed-window counter per scope and client. The client is identified by a keyed hash of its address, so the address
 * itself is never stored. Throws a 429 with Retry-After when the limit is exceeded.
 */
export async function rateLimit(ctx: Ctx, scope: string, clientAddress: string, limit: number): Promise<void> {
  const nowSec = Math.floor(ctx.now() / 1000);
  const window = Math.floor(nowSec / WINDOW_SECONDS);
  const key = `${scope}:${(await sha256Hex(`${ctx.config.sessionSecret ?? "dev"}|${clientAddress}`)).slice(0, 32)}`;
  const row = await ctx.db.first<{ count: number }>(
    "INSERT INTO rate_limits (key, window, count) VALUES (?1, ?2, 1) ON CONFLICT (key, window) DO UPDATE SET count = count + 1 RETURNING count",
    [key, window],
  );
  const count = row?.count ?? 1;
  if (count === 1) await ctx.db.run("DELETE FROM rate_limits WHERE window < ?1", [window - 1]); // tidy old windows
  if (count > limit) {
    const retryAfter = Math.max(1, (window + 1) * WINDOW_SECONDS - nowSec);
    throw new ServiceError("rate_limited", 429, "Too many attempts. Please wait a few minutes and try again.", { retryAfter });
  }
}
