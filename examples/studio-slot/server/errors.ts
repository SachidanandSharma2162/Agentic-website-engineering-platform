import type { ErrorCode } from "../shared/schema.ts";

/** An expected failure with a stable code, an HTTP status and a message safe to show to the visitor. */
export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, status: number, message: string, extra: { fields?: Record<string, string>; retryAfter?: number } = {}) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.fields = extra.fields;
    this.retryAfter = extra.retryAfter;
  }
}
