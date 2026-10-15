import { describe, expect, it } from "vitest";
import { addDays, isDayKey, lastNDays, parseDayKey, toDayKey } from "../../src/domain/dates.ts";
import { addHabit, removeHabit, renameHabit, toggleCheckIn } from "../../src/domain/habits.ts";
import { emptyData, type AppData, type Task } from "../../src/domain/schema.ts";
import { bestStreak, currentStreak } from "../../src/domain/streaks.ts";
import { addTask, filterTasks, normalizeTitle, removeTask, restoreTask, todayProgress, updateTask } from "../../src/domain/tasks.ts";

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, priority: "normal", done: false, today: false, createdAt: "2025-06-15T10:00:00.000Z", ...over });
const withTasks = (...tasks: Task[]): AppData => ({ ...emptyData(), tasks });

describe("dates", () => {
  it("runs in a timezone with DST (guards the DST cases below from passing vacuously)", () => {
    expect(new Date(2025, 0, 15, 12).getTimezoneOffset()).not.toBe(new Date(2025, 6, 15, 12).getTimezoneOffset());
  });

  it("formats local calendar days with zero padding", () => {
    expect(toDayKey(new Date(2025, 0, 5, 23, 59))).toBe("2025-01-05");
    expect(toDayKey(new Date(2025, 11, 31, 0, 0))).toBe("2025-12-31");
  });

  it.each([
    ["2025-01-31", 1, "2025-02-01"],
    ["2025-02-28", 1, "2025-03-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2025-12-31", 1, "2026-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2025-03-01", -1, "2025-02-28"],
    // DST transitions (the suite runs with TZ=America/New_York): calendar arithmetic must not drift.
    ["2025-03-08", 1, "2025-03-09"],
    ["2025-03-09", 1, "2025-03-10"],
    ["2025-03-10", -2, "2025-03-08"],
    ["2025-11-01", 1, "2025-11-02"],
    ["2025-11-02", 1, "2025-11-03"],
    ["2025-11-03", -2, "2025-11-01"],
    ["2025-06-15", 0, "2025-06-15"],
  ])("addDays(%s, %i) = %s", (start, n, expected) => {
    expect(addDays(start, n)).toBe(expected);
  });

  it("validates day keys strictly", () => {
    expect(isDayKey("2025-02-28")).toBe(true);
    expect(isDayKey("2024-02-29")).toBe(true);
    for (const bad of ["2025-02-29", "2025-13-01", "2025-00-10", "2025-1-5", "20250105", "", "2025-02-30", "abcd-ef-gh", "2025-02-28T00:00"]) {
      expect(isDayKey(bad), bad).toBe(false);
    }
  });

  it("round-trips parse and format", () => {
    expect(toDayKey(parseDayKey("2025-03-09"))).toBe("2025-03-09");
    expect(() => parseDayKey("nonsense")).toThrow();
  });

  it("lists the last n days oldest first", () => {
    expect(lastNDays("2025-03-02", 4)).toEqual(["2025-02-27", "2025-02-28", "2025-03-01", "2025-03-02"]);
  });
});

describe("currentStreak (AC8)", () => {
  const TODAY = "2025-06-15";
  const rel = (...offsets: number[]) => offsets.map((n) => addDays(TODAY, n));

  it.each([
    ["no check-ins", [], 0],
    ["today only", [0], 1],
    ["yesterday only counts (today not yet checked)", [-1], 1],
    ["two days ago only is a broken streak", [-2], 0],
    ["today, yesterday, day before", [0, -1, -2], 3],
    ["ending yesterday, today unchecked", [-1, -2], 2],
    ["gap before yesterday resets the run", [0, -2], 1],
    ["gap after a long run does not extend it", [-1, -2, -3, -5, -6], 3],
    ["future days are ignored for the current streak", [1, 2], 0],
    ["duplicates do not inflate", [0, 0, -1, -1], 2],
  ])("%s", (_name, offsets, expected) => {
    expect(currentStreak(rel(...(offsets as number[])), TODAY)).toBe(expected);
  });

  it.each([
    ["across a month boundary", "2025-03-02", ["2025-03-02", "2025-03-01", "2025-02-28"], 3],
    ["across a leap day", "2024-03-01", ["2024-03-01", "2024-02-29", "2024-02-28"], 3],
    ["no leap day in 2025", "2025-03-01", ["2025-03-01", "2025-02-28", "2025-02-27"], 3],
    ["across a year boundary", "2026-01-01", ["2026-01-01", "2025-12-31", "2025-12-30"], 3],
    ["across the spring-forward DST change", "2025-03-10", ["2025-03-10", "2025-03-09", "2025-03-08"], 3],
    ["across the fall-back DST change", "2025-11-03", ["2025-11-03", "2025-11-02", "2025-11-01"], 3],
    ["a long run through DST and month changes", "2025-03-12", lastNDays("2025-03-12", 40), 40],
  ])("%s", (_name, today, days, expected) => {
    expect(currentStreak(days as string[], today as string)).toBe(expected);
  });
});

describe("bestStreak (AC8)", () => {
  it.each([
    ["empty", [], 0],
    ["single day", ["2025-06-01"], 1],
    ["two runs, longest wins", ["2025-06-01", "2025-06-02", "2025-06-03", "2025-06-10", "2025-06-11"], 3],
    ["unordered input", ["2025-06-03", "2025-06-01", "2025-06-02"], 3],
    ["duplicates ignored", ["2025-06-01", "2025-06-01", "2025-06-02"], 2],
    ["run across year end", ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"], 4],
    ["run across leap day", ["2024-02-28", "2024-02-29", "2024-03-01"], 3],
    ["run across DST change", ["2025-03-08", "2025-03-09", "2025-03-10"], 3],
    ["isolated days", ["2025-06-01", "2025-06-03", "2025-06-05"], 1],
  ])("%s", (_name, days, expected) => {
    expect(bestStreak(days as string[])).toBe(expected);
  });
});

describe("task operations", () => {
  it("normalizes titles: trims, rejects empty, caps at 120 (AC1, AC2)", () => {
    expect(normalizeTitle("  hello  ")).toEqual({ ok: true, title: "hello" });
    expect(normalizeTitle("   ").ok).toBe(false);
    expect(normalizeTitle("").ok).toBe(false);
    const long = normalizeTitle("x".repeat(500));
    expect(long.ok && long.title.length).toBe(120);
  });

  it("adds new tasks to the top", () => {
    const d = addTask(withTasks(task("a")), task("b"));
    expect(d.tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("updates only the targeted task and does not mutate the input", () => {
    const before = withTasks(task("a"), task("b"));
    const after = updateTask(before, "a", { done: true });
    expect(after.tasks.map((t) => t.done)).toEqual([true, false]);
    expect(before.tasks[0]?.done).toBe(false);
  });

  it("removes a task and restores it at its original index (AC4)", () => {
    const before = withTasks(task("a"), task("b"), task("c"));
    const { data, removed, index } = removeTask(before, "b");
    expect(data.tasks.map((t) => t.id)).toEqual(["a", "c"]);
    expect(index).toBe(1);
    expect(restoreTask(data, removed!, index).tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("restore clamps the index and never duplicates", () => {
    const base = withTasks(task("a"));
    expect(restoreTask(base, task("z"), 99).tasks.map((t) => t.id)).toEqual(["a", "z"]);
    expect(restoreTask(base, task("a"), 0).tasks).toHaveLength(1);
  });

  it("removing an unknown id is a no-op", () => {
    const before = withTasks(task("a"));
    const r = removeTask(before, "nope");
    expect(r.removed).toBeNull();
    expect(r.data).toBe(before);
  });

  it("combines status filter and case-insensitive search (AC6)", () => {
    const tasks = [task("1", { title: "Buy Milk" }), task("2", { title: "Buy bread", done: true }), task("3", { title: "Call mum" })];
    expect(filterTasks(tasks, "all", "").map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(filterTasks(tasks, "all", "BUY").map((t) => t.id)).toEqual(["1", "2"]);
    expect(filterTasks(tasks, "active", "buy").map((t) => t.id)).toEqual(["1"]);
    expect(filterTasks(tasks, "done", "buy").map((t) => t.id)).toEqual(["2"]);
    expect(filterTasks(tasks, "done", "call")).toEqual([]);
    expect(filterTasks(tasks, "all", "  milk ").map((t) => t.id)).toEqual(["1"]);
  });

  it("computes progress over pinned tasks only (AC5)", () => {
    expect(todayProgress([])).toEqual({ done: 0, total: 0, fraction: 0 });
    const tasks = [task("1", { today: true, done: true }), task("2", { today: true }), task("3", { done: true })];
    expect(todayProgress(tasks)).toEqual({ done: 1, total: 2, fraction: 0.5 });
  });
});

describe("habit operations (AC7)", () => {
  const base = addHabit(emptyData(), { id: "h1", name: "Walk", checkIns: [] });

  it("toggles a check-in on and off, one per day, keeping days sorted", () => {
    const on = toggleCheckIn(toggleCheckIn(base, "h1", "2025-06-15"), "h1", "2025-06-14");
    expect(on.habits[0]?.checkIns).toEqual(["2025-06-14", "2025-06-15"]);
    const off = toggleCheckIn(on, "h1", "2025-06-15");
    expect(off.habits[0]?.checkIns).toEqual(["2025-06-14"]);
  });

  it("renames with trimming and ignores empty names", () => {
    expect(renameHabit(base, "h1", "  Run ").habits[0]?.name).toBe("Run");
    expect(renameHabit(base, "h1", "   ")).toBe(base);
  });

  it("removes a habit", () => {
    expect(removeHabit(base, "h1").habits).toEqual([]);
  });
});
