import type { ClassView } from "../shared/schema.ts";

export interface LastBooking {
  bookingId: string;
  code: string;
  class: ClassView;
  studioTimezone: string;
}

// The cancellation code is shown once and kept only in memory: a reload or leaving the page forgets it, on purpose.
let current: LastBooking | null = null;

export const rememberBooking = (b: LastBooking): void => {
  current = b;
};
export const peekBooking = (): LastBooking | null => current;
export const forgetBooking = (): void => {
  current = null;
};
