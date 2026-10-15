import type { ZodType } from "zod";
import { BookingInput, CancelInput, ClassInput, LIMITS, LoginInput, type ApiErrorBody } from "../shared/schema.ts";
import { resolveConfig, type Env } from "./config.ts";
import { randomCode } from "./crypto.ts";
import { d1Db } from "./db/d1.ts";
import type { Db } from "./db/types.ts";
import { ServiceError } from "./errors.ts";
import { cancelBooking, createBooking } from "./services/bookings.ts";
import { cancelClass, createClass, getClass, listAdminClasses, listClasses } from "./services/classes.ts";
import type { Ctx } from "./services/context.ts";
import { rateLimit } from "./services/ratelimit.ts";
import { purgeExpired } from "./services/retention.ts";
import { clearSessionCookie, createSessionCookie, hasValidSession, passphraseMatches } from "./services/session.ts";

export interface HandleOptions {
  /** Override the database (tests and the dev server pass real SQLite here); defaults to env.DB. */
  db?: Db;
  now?: () => number;
}

const BASE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

function json(status: number, body: unknown, extra: Record<string, string> = {}, cookies: string[] = []): Response {
  const headers = new Headers({ ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", ...extra });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(e: ServiceError): Response {
  const body: ApiErrorBody = { error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } };
  return json(e.status, body, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});
}

/** Read a JSON body with a hard size cap, then validate it. Failures are visitor-safe 4xx errors. */
async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new ServiceError("bad_request", 415, "Send JSON.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxBodyBytes) throw new ServiceError("too_large", 413, "That request is too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > LIMITS.maxBodyBytes) throw new ServiceError("too_large", 413, "That request is too large.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ServiceError("bad_request", 400, "That request was not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "body")] ??= issue.message;
    throw new ServiceError("validation", 400, Object.values(fields)[0] ?? "Please check what you entered.", { fields });
  }
  return parsed.data;
}

/** Best available client address. Cloudflare sets CF-Connecting-IP; the dev server forwards the socket address. */
const clientAddress = (req: Request): string => req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

async function requireAdmin(ctx: Ctx, req: Request, state: { changing: boolean }): Promise<void> {
  if (!ctx.config.adminPassphrase || !ctx.config.sessionSecret) throw new ServiceError("unavailable", 503, "The owner area is not set up yet.");
  if (!(await hasValidSession(ctx.config, req.headers.get("cookie"), ctx.now()))) throw new ServiceError("unauthorized", 401, "Please sign in.");
  // Defence in depth on top of SameSite=Strict: state-changing admin calls must carry a header a cross-site form cannot set.
  if (state.changing && req.headers.get("x-requested-with") !== "studio-slot") throw new ServiceError("forbidden", 403, "That request was not allowed.");
}

const ALLOWED: Record<string, string> = {
  "/api/health": "GET",
  "/api/classes": "GET",
  "/api/bookings": "POST",
  "/api/bookings/cancel": "POST",
  "/api/admin/login": "POST",
  "/api/admin/logout": "POST",
  "/api/admin/session": "GET",
};

/** The whole API as one function from Request to Response, so Pages Functions, the dev server and tests all run the same code. */
export async function handle(req: Request, env: Env, opts: HandleOptions = {}): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();

    const cfg = resolveConfig(env);
    if (!cfg.ok) {
      console.error("config_error", cfg.problem);
      return errorResponse(new ServiceError("unavailable", 503, "The service is not configured correctly."));
    }
    const ctx: Ctx = { db: opts.db ?? d1Db(env.DB), now: opts.now ?? Date.now, config: cfg.config };

    // ----- public -----
    if (path === "/api/health" && method === "GET") {
      await ctx.db.first("SELECT 1 AS ok");
      return json(200, { ok: true });
    }
    if (path === "/api/classes" && method === "GET") {
      return json(200, { studioTimezone: ctx.config.studioTz, now: ctx.now(), classes: await listClasses(ctx) });
    }
    if (path === "/api/bookings" && method === "POST") {
      await rateLimit(ctx, "book", clientAddress(req), ctx.config.limits.book);
      const input = await readJson(req, BookingInput);
      if (input.website) {
        // A bot filled the hidden field. Answer like a success, store nothing, give nothing away.
        const cls = await getClass(ctx, input.classId);
        if (!cls) throw new ServiceError("class_not_found", 404, "That class does not exist.");
        return json(201, { bookingId: crypto.randomUUID(), code: randomCode(), class: cls });
      }
      return json(201, await createBooking(ctx, input));
    }
    if (path === "/api/bookings/cancel" && method === "POST") {
      await rateLimit(ctx, "cancel", clientAddress(req), ctx.config.limits.cancel);
      await cancelBooking(ctx, await readJson(req, CancelInput));
      return json(200, { ok: true });
    }

    // ----- owner -----
    if (path === "/api/admin/login" && method === "POST") {
      if (!ctx.config.adminPassphrase || !ctx.config.sessionSecret) throw new ServiceError("unavailable", 503, "The owner area is not set up yet.");
      await rateLimit(ctx, "login", clientAddress(req), ctx.config.limits.login);
      const { passphrase } = await readJson(req, LoginInput);
      if (!(await passphraseMatches(ctx.config, passphrase))) throw new ServiceError("unauthorized", 401, "That passphrase isn't right.");
      return json(200, { ok: true }, {}, [await createSessionCookie(ctx.config, ctx.now())]);
    }
    if (path === "/api/admin/session" && method === "GET") {
      // Lets the owner page ask "am I signed in?" without a failing request (a 401 would be logged as a console error).
      return json(200, { signedIn: await hasValidSession(ctx.config, req.headers.get("cookie"), ctx.now()) });
    }
    if (path === "/api/admin/logout" && method === "POST") {
      await requireAdmin(ctx, req, { changing: true });
      return json(200, { ok: true }, {}, [clearSessionCookie(ctx.config)]);
    }
    if (path === "/api/admin/classes" && method === "GET") {
      await requireAdmin(ctx, req, { changing: false });
      await purgeExpired(ctx);
      return json(200, { studioTimezone: ctx.config.studioTz, now: ctx.now(), classes: await listAdminClasses(ctx) });
    }
    if (path === "/api/admin/classes" && method === "POST") {
      await requireAdmin(ctx, req, { changing: true });
      return json(201, await createClass(ctx, await readJson(req, ClassInput)));
    }
    const cancel = /^\/api\/admin\/classes\/([A-Za-z0-9-]{1,64})\/cancel$/.exec(path);
    if (cancel && method === "POST") {
      await requireAdmin(ctx, req, { changing: true });
      await cancelClass(ctx, cancel[1]!);
      return json(200, { ok: true });
    }

    // ----- everything else -----
    const known = ALLOWED[path] ?? (path === "/api/admin/classes" ? "GET, POST" : cancel ? "POST" : undefined);
    if (known) return json(405, { error: { code: "bad_request", message: "That method is not allowed here." } }, { allow: known });
    return errorResponse(new ServiceError("not_found", 404, "That endpoint does not exist."));
  } catch (e) {
    if (e instanceof ServiceError) return errorResponse(e);
    // Unexpected failure (for example the database is down or a free-tier daily limit was hit). Log without personal data.
    const message = e instanceof Error ? e.message : String(e);
    console.error("unhandled_error", message.slice(0, 200));
    if (/daily|limit|quota|exceeded/i.test(message)) {
      return errorResponse(new ServiceError("daily_limit", 503, "We're at capacity for today. Please try again later.", { retryAfter: 3600 }));
    }
    return errorResponse(new ServiceError("unavailable", 503, "Something went wrong on our side. Please try again."));
  }
}
