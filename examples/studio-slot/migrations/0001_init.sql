-- Studio Slot schema v1. Additive only; a later migration that drops or rewrites data needs explicit approval (Gate E).

CREATE TABLE classes (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  starts_at    INTEGER NOT NULL,                       -- epoch milliseconds, UTC
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 240),
  capacity     INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  cancelled    INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_classes_starts_at ON classes (starts_at);

CREATE TABLE bookings (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,                            -- lower-cased
  code_hash  TEXT NOT NULL,                            -- SHA-256 of the cancellation code; the code itself is never stored
  created_at INTEGER NOT NULL,
  UNIQUE (class_id, email)                             -- one booking per email per class
);
CREATE INDEX idx_bookings_class ON bookings (class_id);
CREATE UNIQUE INDEX idx_bookings_code ON bookings (class_id, code_hash);

CREATE TABLE rate_limits (
  key    TEXT NOT NULL,                                -- scope plus a keyed hash of the client address, never the address itself
  window INTEGER NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
