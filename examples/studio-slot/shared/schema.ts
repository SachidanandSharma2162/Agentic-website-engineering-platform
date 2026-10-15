import { z } from "zod";

// zod probes for eval support with `new Function("")`; a strict CSP reports that even though the throw is swallowed.
// (Found on the first deployed site.) jitless skips the probe.
z.config({ jitless: true });

export const LIMITS = {
  nameMax: 60,
  emailMax: 120,
  titleMax: 60,
  capacityMin: 1,
  capacityMax: 100,
  durationMin: 15,
  durationMax: 240,
  bookingWindowDays: 14,
  /** How far ahead the owner's list reaches. Classes can be added up to a year ahead; they appear here as their date approaches. */
  adminWindowDays: 60,
  retentionDays: 90,
  maxBodyBytes: 4096,
} as const;

// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;
const text = (max: number, label: string) =>
  z.string().trim().min(1, `Please enter ${label}.`).max(max, `${label[0]?.toUpperCase()}${label.slice(1)} is too long.`).regex(NO_CONTROL, "Contains characters that are not allowed.");

export const BookingInput = z.object({
  classId: z.string().min(1).max(64),
  name: text(LIMITS.nameMax, "your name"),
  email: z.string().trim().min(1, "Please enter your email address.").max(LIMITS.emailMax, "That email address is too long.").pipe(z.email("Please enter a valid email address.")),
  /** Honeypot: real people never see or fill this field. */
  website: z.string().max(200).optional(),
});
export type BookingInput = z.infer<typeof BookingInput>;

export const CancelInput = z.object({
  classId: z.string().min(1).max(64),
  code: z.string().trim().min(1, "Please enter your code.").max(32).regex(/^[A-Za-z0-9-]+$/, "That code has characters a code never contains."),
});
export type CancelInput = z.infer<typeof CancelInput>;

export const LoginInput = z.object({ passphrase: z.string().min(1, "Please enter the passphrase.").max(200) });

export const ClassInput = z.object({
  title: text(LIMITS.titleMax, "a title"),
  /** Epoch milliseconds, UTC. The admin form converts studio wall-clock time before sending. */
  startsAt: z.number().int().positive(),
  durationMin: z.number().int().min(LIMITS.durationMin).max(LIMITS.durationMax),
  capacity: z.number().int().min(LIMITS.capacityMin, "Capacity must be at least 1.").max(LIMITS.capacityMax, "Capacity can be at most 100."),
});
export type ClassInput = z.infer<typeof ClassInput>;

export interface ClassView {
  id: string;
  title: string;
  startsAt: number;
  durationMin: number;
  capacity: number;
  spotsLeft: number;
  cancelled: boolean;
}

export interface RosterEntry {
  name: string;
  email: string;
}

export interface AdminClassView extends ClassView {
  roster: RosterEntry[];
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

/** Error codes the API can return, so the UI can show a specific message for each. */
export type ErrorCode =
  | "validation"
  | "class_not_found"
  | "class_full"
  | "class_cancelled"
  | "class_started"
  | "already_booked"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "too_large"
  | "bad_request"
  | "daily_limit"
  | "unavailable";
