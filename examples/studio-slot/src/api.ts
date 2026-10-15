import type { AdminClassView, ApiErrorBody, ClassView, ErrorCode } from "../shared/schema.ts";

/** Everything that can go wrong talking to the API, with a stable code the UI turns into words. */
export class ApiError extends Error {
  readonly code: ErrorCode | "network";
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly retryAfter: number | undefined;

  constructor(code: ApiError["code"], status: number, message: string, fields: Record<string, string> = {}, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

export interface ClassesResponse {
  studioTimezone: string;
  now: number;
  classes: ClassView[];
}
export interface AdminClassesResponse {
  studioTimezone: string;
  now: number;
  classes: AdminClassView[];
}
export interface BookingResponse {
  bookingId: string;
  code: string;
  class: ClassView;
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method === "POST" && path.startsWith("/api/admin/")) headers["x-requested-with"] = "studio-slot"; // required by the server for owner changes
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, credentials: "same-origin" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network", 0, "Could not reach the booking service.");
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (res.ok) return data as T;
  const err = (data as ApiErrorBody | undefined)?.error;
  if (err) throw new ApiError(err.code, res.status, err.message, err.fields, Number(res.headers.get("retry-after")) || undefined);
  // A non-JSON failure comes from the platform in front of us: 429 is Cloudflare's daily request limit, anything else is an outage.
  throw new ApiError(res.status === 429 ? "daily_limit" : "unavailable", res.status, "The booking service is unavailable.");
}

export const api = {
  classes: (signal?: AbortSignal) => request<ClassesResponse>("GET", "/api/classes", undefined, signal),
  book: (input: { classId: string; name: string; email: string; website?: string }, signal?: AbortSignal) => request<BookingResponse>("POST", "/api/bookings", input, signal),
  cancelBooking: (input: { classId: string; code: string }, signal?: AbortSignal) => request<{ ok: true }>("POST", "/api/bookings/cancel", input, signal),
  login: (passphrase: string, signal?: AbortSignal) => request<{ ok: true }>("POST", "/api/admin/login", { passphrase }, signal),
  logout: (signal?: AbortSignal) => request<{ ok: true }>("POST", "/api/admin/logout", {}, signal),
  adminClasses: (signal?: AbortSignal) => request<AdminClassesResponse>("GET", "/api/admin/classes", undefined, signal),
  addClass: (input: { title: string; startsAt: number; durationMin: number; capacity: number }, signal?: AbortSignal) => request<ClassView>("POST", "/api/admin/classes", input, signal),
  cancelClass: (id: string, signal?: AbortSignal) => request<{ ok: true }>("POST", `/api/admin/classes/${encodeURIComponent(id)}/cancel`, {}, signal),
};

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

/** What to tell the visitor when a call fails for a reason that is not about their input. */
export function serviceProblem(e: unknown): { kind: "limit" | "outage" | "wait"; text: string } | null {
  if (!(e instanceof ApiError)) return { kind: "outage", text: "Something unexpected went wrong. Please try again. Nothing was changed." };
  switch (e.code) {
    case "daily_limit":
      return { kind: "limit", text: "We're at capacity for today. The booking service has reached its daily limit and resets at midnight UTC. Please try again later, or contact the studio." };
    case "rate_limited": {
      const mins = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : undefined;
      return { kind: "wait", text: `Too many attempts. Please wait ${mins ? `about ${mins} minute${mins === 1 ? "" : "s"}` : "a few minutes"} and try again.` };
    }
    case "network":
    case "unavailable":
      return { kind: "outage", text: "We couldn't reach the booking service. Check your connection and try again. Nothing was changed." };
    default:
      return null;
  }
}
