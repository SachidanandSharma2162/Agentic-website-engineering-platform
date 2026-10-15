import { describe, expect, it } from "vitest";
import { LIMITS, type AppData } from "../../src/domain/schema.ts";
import { CORRUPT_BACKUP_KEY, STORAGE_KEY, createLocalStorageAdapter, parseData, serializeData } from "../../src/storage/storage.ts";

const sample: AppData = {
  version: 1,
  tasks: [{ id: "t1", title: "Write report", priority: "high", done: false, today: true, createdAt: "2025-06-15T10:00:00.000Z" }],
  habits: [{ id: "h1", name: "Walk", checkIns: ["2025-06-14", "2025-06-15"] }],
};

class FakeKV {
  items = new Map<string, string>();
  failWrites = false;
  failReads = false;
  getItem(k: string) {
    if (this.failReads) throw new Error("denied");
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.items.set(k, v);
  }
}

describe("export and import (AC10, AC11)", () => {
  it("round-trips data exactly", () => {
    const result = parseData(serializeData(sample));
    expect(result).toEqual({ ok: true, data: sample });
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["JSON that is not an object", "42", /not a Focus Board export/],
    ["null", "null", /not a Focus Board export/],
    ["an array", "[]", /not a Focus Board export/],
    ["no version", JSON.stringify({ tasks: [], habits: [] }), /not a Focus Board export/],
    ["unknown version", JSON.stringify({ version: 2, tasks: [], habits: [] }), /unknown version/],
    ["missing arrays", JSON.stringify({ version: 1 }), /invalid data/],
    ["task with empty title", JSON.stringify({ ...sample, tasks: [{ ...sample.tasks[0], title: "   " }] }), /invalid data/],
    ["task title over the cap", JSON.stringify({ ...sample, tasks: [{ ...sample.tasks[0], title: "x".repeat(LIMITS.titleMax + 1) }] }), /invalid data/],
    ["bad priority", JSON.stringify({ ...sample, tasks: [{ ...sample.tasks[0], priority: "urgent" }] }), /invalid data/],
    ["impossible check-in date", JSON.stringify({ ...sample, habits: [{ id: "h", name: "x", checkIns: ["2025-02-30"] }] }), /invalid data/],
    ["too many tasks", JSON.stringify({ ...sample, tasks: Array.from({ length: LIMITS.maxTasks + 1 }, (_, i) => ({ ...sample.tasks[0], id: `t${i}` })) }), /invalid data/],
  ])("rejects %s without throwing", (_name, text, message) => {
    const r = parseData(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it("rejects files over 1 MB", () => {
    const r = parseData(" ".repeat(LIMITS.maxImportBytes + 1));
    expect(r).toEqual({ ok: false, error: "That file is larger than 1 MB." });
  });

  it("strips unknown keys and cannot be polluted through __proto__", () => {
    const text = '{"version":1,"__proto__":{"polluted":true},"tasks":[],"habits":[],"extra":"x"}';
    const r = parseData(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.data).sort()).toEqual(["habits", "tasks", "version"]);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("treats markup in titles as plain data (rendered as text by React)", () => {
    const evil = { ...sample, tasks: [{ ...sample.tasks[0]!, title: "<img src=x onerror=alert(1)>" }] };
    const r = parseData(JSON.stringify(evil));
    expect(r.ok && r.data.tasks[0]?.title).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("localStorage adapter (AC9, R3)", () => {
  it("returns empty data without a notice on first run", () => {
    const r = createLocalStorageAdapter(new FakeKV()).load();
    expect(r.data).toEqual({ version: 1, tasks: [], habits: [] });
    expect(r.notice).toBeUndefined();
  });

  it("persists and reloads identical data", () => {
    const kv = new FakeKV();
    expect(createLocalStorageAdapter(kv).save(sample)).toBeNull();
    expect(createLocalStorageAdapter(kv).load().data).toEqual(sample);
  });

  it("starts empty with a notice on corrupt data and keeps a backup copy instead of discarding it", () => {
    const kv = new FakeKV();
    kv.items.set(STORAGE_KEY, "{not json");
    const r = createLocalStorageAdapter(kv).load();
    expect(r.data.tasks).toEqual([]);
    expect(r.notice).toMatch(/unreadable/);
    expect(kv.items.get(CORRUPT_BACKUP_KEY)).toBe("{not json");
    expect(kv.items.get(STORAGE_KEY)).toBe("{not json");
  });

  it("starts empty with a notice when stored data has the wrong shape", () => {
    const kv = new FakeKV();
    kv.items.set(STORAGE_KEY, JSON.stringify({ version: 1, tasks: "nope", habits: [] }));
    expect(createLocalStorageAdapter(kv).load().notice).toMatch(/unreadable/);
  });

  it("falls back to memory with a notice when storage is unavailable", () => {
    const adapter = createLocalStorageAdapter(null);
    expect(adapter.load().notice).toMatch(/unavailable/);
    expect(adapter.save(sample)).toMatch(/not being saved/);
  });

  it("reports a failed save (quota) instead of throwing", () => {
    const kv = new FakeKV();
    kv.failWrites = true;
    expect(createLocalStorageAdapter(kv).save(sample)).toMatch(/storage may be full/);
  });

  it("survives a read that throws", () => {
    const kv = new FakeKV();
    kv.failReads = true;
    const r = createLocalStorageAdapter(kv).load();
    expect(r.data.tasks).toEqual([]);
    expect(r.notice).toMatch(/could not be read/);
  });
});
