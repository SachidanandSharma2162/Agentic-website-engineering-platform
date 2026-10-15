import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App.tsx";
import { LIMITS, type AppData } from "../../src/domain/schema.ts";
import { createMemoryAdapter, serializeData } from "../../src/storage/storage.ts";
import { TOAST_MS } from "../../src/ui/Toast.tsx";

const NOW = new Date(2025, 5, 15, 10, 0, 0); // Sunday 15 June 2025, local
const clock = { now: () => NOW };

const seed = (over: Partial<AppData> = {}): AppData => ({ version: 1, tasks: [], habits: [], ...over });

function mount(route = "/", adapter = createMemoryAdapter()) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <App storage={adapter} clock={clock} />
    </MemoryRouter>,
  );
  return { user, adapter, ...view };
}

const task = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, title, priority: "normal" as const, done: false, today: false, createdAt: NOW.toISOString(), ...over });

const readBlob = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

afterEach(() => vi.useRealTimers());

describe("AC1: adding tasks", () => {
  it("adds a task to the top and clears the field", async () => {
    const { user } = mount("/tasks", createMemoryAdapter(seed({ tasks: [task("a", "Existing")] })));
    const input = screen.getByRole("textbox", { name: "New task" });
    await user.type(input, "  Buy milk {Enter}");
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Buy milk");
    expect(items[1]).toHaveTextContent("Existing");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("rejects an empty or whitespace-only title with a visible error and keeps focus", async () => {
    const { user } = mount("/tasks");
    const input = screen.getByRole("textbox", { name: "New task" });
    await user.type(input, "   {Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title first.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    await user.type(input, "ok");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("caps long titles at 120 characters in the field and in the stored task", async () => {
    const { user, adapter } = mount("/tasks");
    const input = screen.getByRole("textbox", { name: "New task" });
    expect(input).toHaveAttribute("maxlength", String(LIMITS.titleMax));
    await user.click(input);
    await user.paste("y".repeat(300));
    await user.keyboard("{Enter}");
    expect(adapter.snapshot().tasks[0]?.title).toHaveLength(LIMITS.titleMax);
  });
});

describe("AC2: completing tasks", () => {
  it("toggles done and updates the Today progress", async () => {
    const { user } = mount("/", createMemoryAdapter(seed({ tasks: [task("a", "A", { today: true }), task("b", "B", { today: true })] })));
    expect(screen.getByRole("img", { name: "0 of 2 done" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Mark “A” as done" }));
    expect(screen.getByRole("img", { name: "1 of 2 done" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Mark “A” as done" }));
    expect(screen.getByRole("img", { name: "0 of 2 done" })).toBeInTheDocument();
  });
});

describe("AC3: editing tasks", () => {
  it("saves on Enter, including a priority change", async () => {
    const { user, adapter } = mount("/tasks", createMemoryAdapter(seed({ tasks: [task("a", "Old title")] })));
    await user.click(screen.getByRole("button", { name: "Edit “Old title”" }));
    const field = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(field);
    await user.type(field, "New title");
    await user.selectOptions(screen.getByRole("combobox", { name: "Priority" }), "high");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("New title");
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(adapter.snapshot().tasks[0]).toMatchObject({ title: "New title", priority: "high" });
    expect(screen.getByRole("button", { name: "Edit “New title”" })).toHaveFocus();
  });

  it("cancels on Escape without saving", async () => {
    const { user, adapter } = mount("/tasks", createMemoryAdapter(seed({ tasks: [task("a", "Keep me")] })));
    await user.click(screen.getByRole("button", { name: "Edit “Keep me”" }));
    await user.clear(screen.getByRole("textbox", { name: "Task title" }));
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Changed");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("Keep me");
    expect(adapter.snapshot().tasks[0]?.title).toBe("Keep me");
  });

  it("saves when focus leaves the row", async () => {
    const { user } = mount("/tasks", createMemoryAdapter(seed({ tasks: [task("a", "Before")] })));
    await user.click(screen.getByRole("button", { name: "Edit “Before”" }));
    const field = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(field);
    await user.type(field, "After");
    await user.click(screen.getByRole("textbox", { name: "New task" }));
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("After");
  });

  it("refuses an empty title on Enter and shows an error", async () => {
    const { user } = mount("/tasks", createMemoryAdapter(seed({ tasks: [task("a", "Name")] })));
    await user.click(screen.getByRole("button", { name: "Edit “Name”" }));
    await user.clear(screen.getByRole("textbox", { name: "Task title" }));
    await user.keyboard("{Enter}");
    expect(screen.getByText("Enter a title first.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task title" })).toBeInTheDocument();
  });
});

describe("AC4: delete with undo", () => {
  const three = () => createMemoryAdapter(seed({ tasks: [task("a", "First"), task("b", "Second"), task("c", "Third")] }));

  it("restores the task at its original position", async () => {
    const { user } = mount("/tasks", three());
    await user.click(screen.getByRole("button", { name: "Delete “Second”" }));
    const list = screen.getByRole("list", { name: "Tasks" });
    expect(list).not.toHaveTextContent("Second");
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Second”");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    const titles = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(titles[0]).toContain("First");
    expect(titles[1]).toContain("Second");
    expect(titles[2]).toContain("Third");
  });

  it("offers Undo for exactly 6 seconds, after which the deletion is final", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, adapter } = mount("/tasks", three());
    await user.click(screen.getByRole("button", { name: "Delete “Second”" }));
    act(() => void vi.advanceTimersByTime(TOAST_MS - 100));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(adapter.snapshot().tasks.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("AC5: Today list", () => {
  it("shows pinned tasks and done/total progress, and an empty state when none are pinned", async () => {
    const { user } = mount("/", createMemoryAdapter(seed({ tasks: [task("a", "Pinned one", { today: true }), task("b", "Other")] })));
    const list = screen.getByRole("list", { name: "Today's tasks" });
    expect(list).toHaveTextContent("Pinned one");
    expect(list).not.toHaveTextContent("Other");
    expect(screen.getByRole("img", { name: "0 of 1 done" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pin “Pinned one” to Today" }));
    expect(screen.getByText("Nothing pinned for today")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 of 0 done" })).toBeInTheDocument();
  });

  it("pins tasks added from Today and shows the long-form date", async () => {
    const { user } = mount("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sunday, June 15");
    await user.type(screen.getByRole("textbox", { name: "New task for today" }), "Plan day{Enter}");
    expect(screen.getByRole("list", { name: "Today's tasks" })).toHaveTextContent("Plan day");
  });
});

describe("AC6: filter and search", () => {
  const tasks = [task("1", "Buy Milk"), task("2", "Buy bread", { done: true }), task("3", "Call mum")];

  it("combines status filter with case-insensitive search", async () => {
    const { user } = mount("/tasks", createMemoryAdapter(seed({ tasks })));
    await user.type(screen.getByRole("searchbox", { name: "Search tasks" }), "BUY");
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Buy Milk");
  });

  it("shows an empty state with a working Clear filters action", async () => {
    const { user } = mount("/tasks", createMemoryAdapter(seed({ tasks })));
    await user.type(screen.getByRole("searchbox", { name: "Search tasks" }), "zzz");
    expect(screen.getByText("No matching tasks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox", { name: "Search tasks" })).toHaveValue("");
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows a different empty state when there are no tasks at all", () => {
    mount("/tasks");
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });
});

describe("AC7: habit check-ins", () => {
  it("checks in for today (local date) and unchecks on the second click", async () => {
    const { user, adapter } = mount("/habits", createMemoryAdapter(seed({ habits: [{ id: "h", name: "Walk", checkIns: ["2025-06-14"] }] })));
    const card = screen.getByRole("article", { name: "Walk" });
    expect(within(card).getByText(/current streak/).firstElementChild).toHaveTextContent("1"); // streak ending yesterday
    await user.click(screen.getByRole("button", { name: "Check in today" }));
    expect(adapter.snapshot().habits[0]?.checkIns).toEqual(["2025-06-14", "2025-06-15"]);
    const done = screen.getByRole("button", { name: "Checked in ✓" });
    expect(done).toHaveAttribute("aria-pressed", "true");
    await user.click(done);
    expect(adapter.snapshot().habits[0]?.checkIns).toEqual(["2025-06-14"]);
  });

  it("shows streaks and the last-7-days summary", () => {
    mount("/habits", createMemoryAdapter(seed({ habits: [{ id: "h", name: "Read", checkIns: ["2025-06-10", "2025-06-11", "2025-06-14", "2025-06-15"] }] })));
    const card = screen.getByRole("article", { name: "Read" });
    expect(within(card).getByText(/current streak/).firstElementChild).toHaveTextContent("2");
    expect(within(card).getByText(/best streak/).firstElementChild).toHaveTextContent("2");
    expect(within(card).getByRole("img", { name: "Last 7 days: 4 of 7 checked in" })).toBeInTheDocument();
  });

  it("adds, renames and deletes habits (with confirmation)", async () => {
    const { user, adapter } = mount("/habits");
    await user.type(screen.getByRole("textbox", { name: "New habit" }), "Stretch{Enter}");
    expect(adapter.snapshot().habits.map((h) => h.name)).toEqual(["Stretch"]);
    await user.click(screen.getByRole("button", { name: "Rename habit “Stretch”" }));
    const field = screen.getByRole("textbox", { name: "Habit name" });
    await user.clear(field);
    await user.type(field, "Yoga{Enter}");
    expect(adapter.snapshot().habits[0]?.name).toBe("Yoga");
    await user.click(screen.getByRole("button", { name: "Delete habit “Yoga”" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(adapter.snapshot().habits).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete habit “Yoga”" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(adapter.snapshot().habits).toEqual([]);
    expect(screen.getByText("No habits yet")).toBeInTheDocument();
  });
});

describe("AC9: persistence", () => {
  it("a fresh mount with the same storage shows identical data", async () => {
    const adapter = createMemoryAdapter();
    const first = mount("/tasks", adapter);
    await first.user.type(screen.getByRole("textbox", { name: "New task" }), "Survive reload{Enter}");
    first.unmount();
    mount("/tasks", adapter);
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("Survive reload");
  });

  it("starts empty with a notice when saved data is unreadable, and does not overwrite it until the user changes something", () => {
    const save = vi.fn(() => null);
    const adapter = { load: () => ({ data: seed(), notice: "Your saved data was unreadable, so you are starting empty." }), save, snapshot: () => seed() };
    mount("/", adapter);
    expect(screen.getByText(/saved data was unreadable/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("surfaces a failed save", async () => {
    const adapter = { load: () => ({ data: seed() }), save: () => "Your browser refused to save (storage may be full).", snapshot: () => seed() };
    const { user } = mount("/tasks", adapter);
    await user.type(screen.getByRole("textbox", { name: "New task" }), "x{Enter}");
    expect(screen.getByText(/storage may be full/)).toBeInTheDocument();
  });
});

describe("AC10-AC12: settings", () => {
  const fileOf = (text: string, name = "data.json") => new File([text], name, { type: "application/json" });

  it("imports a valid file only after confirmation", async () => {
    const incoming: AppData = seed({ tasks: [task("n", "Imported task")] });
    const { user, adapter } = mount("/settings", createMemoryAdapter(seed({ tasks: [task("o", "Old task")] })));
    await user.upload(screen.getByLabelText(/Choose a \.json file/), fileOf(serializeData(incoming)));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("1 task and 0 habits");
    expect(adapter.snapshot().tasks[0]?.title).toBe("Old task"); // not yet replaced
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    expect(adapter.snapshot()).toEqual(incoming);
  });

  it("cancelling the import confirmation changes nothing", async () => {
    const { user, adapter } = mount("/settings", createMemoryAdapter(seed({ tasks: [task("o", "Old task")] })));
    await user.upload(screen.getByLabelText(/Choose a \.json file/), fileOf(serializeData(seed())));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(adapter.snapshot().tasks[0]?.title).toBe("Old task");
  });

  it.each([
    ["not JSON", "{broken", /not valid JSON/],
    ["wrong schema", JSON.stringify({ version: 1, tasks: [{ nope: 1 }], habits: [] }), /invalid data/],
    ["unknown version", JSON.stringify({ version: 9, tasks: [], habits: [] }), /unknown version/],
  ])("rejects %s, shows an error and changes nothing", async (_n, text, message) => {
    const { user, adapter } = mount("/settings", createMemoryAdapter(seed({ tasks: [task("o", "Old task")] })));
    await user.upload(screen.getByLabelText(/Choose a \.json file/), fileOf(text));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(adapter.snapshot().tasks[0]?.title).toBe("Old task");
  });

  it("rejects an oversize file", async () => {
    const { user, adapter } = mount("/settings", createMemoryAdapter(seed({ tasks: [task("o", "Old task")] })));
    const big = fileOf("0".repeat(LIMITS.maxImportBytes + 1));
    await user.upload(screen.getByLabelText(/Choose a \.json file/), big);
    expect(await screen.findByText(/larger than 1 MB/)).toBeInTheDocument();
    expect(adapter.snapshot().tasks).toHaveLength(1);
  });

  it("export downloads JSON that re-imports to identical data", async () => {
    const data = seed({ tasks: [task("a", "Exported", { today: true })], habits: [{ id: "h", name: "Walk", checkIns: ["2025-06-15"] }] });
    let blob: Blob | null = null;
    let filename = "";
    const create = vi.fn((b: Blob) => ((blob = b), "blob:fake"));
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
    const { user, adapter } = mount("/settings", createMemoryAdapter(data));
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    expect(click).toHaveBeenCalled();
    expect(filename).toBe("focus-board-2025-06-15.json");
    const text = await readBlob(blob!);
    await user.upload(screen.getByLabelText(/Choose a \.json file/), fileOf(text));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace" }));
    expect(adapter.snapshot()).toEqual(data);
    click.mockRestore();
  });

  it("reset requires confirmation and then leaves the empty state", async () => {
    const { user, adapter } = mount("/settings", createMemoryAdapter(seed({ tasks: [task("a", "Doomed")], habits: [{ id: "h", name: "H", checkIns: [] }] })));
    await user.click(screen.getByRole("button", { name: "Delete all data…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(adapter.snapshot().tasks).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete all data…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete everything" }));
    expect(adapter.snapshot()).toEqual(seed());
  });
});

describe("AC13: routing", () => {
  it.each([
    ["/", "Today"],
    ["/tasks", "Tasks"],
    ["/habits", "Habits"],
    ["/settings", "Settings"],
  ])("renders %s directly with the right heading, title and active nav", (route, name) => {
    mount(route);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name === "Today" ? /\w+, \w+ \d+/ : name);
    expect(document.title).toBe(`${name} · Focus Board`);
    expect(screen.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  });

  it("shows a not-found page with a link home for unknown routes", async () => {
    const { user } = mount("/nope/nothing");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(document.title).toBe("Page not found · Focus Board");
    await user.click(screen.getByRole("link", { name: "Back to Today" }));
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("moves focus to the main region after navigating", async () => {
    const { user } = mount("/");
    await user.click(screen.getByRole("link", { name: "Habits" }));
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("ProgressRing", () => {
  it("sets the drawn arc inline so no stylesheet rule can override it", () => {
    mount("/", createMemoryAdapter(seed({ tasks: [task("a", "A", { today: true, done: true }), task("b", "B", { today: true })] })));
    const arc = screen.getByRole("img", { name: "1 of 2 done" }).querySelector<SVGCircleElement>(".fg")!;
    const circumference = 2 * Math.PI * 42;
    expect(parseFloat(arc.style.strokeDasharray)).toBeCloseTo(circumference, 3);
    expect(parseFloat(arc.style.strokeDashoffset)).toBeCloseTo(circumference / 2, 3);
  });
});
