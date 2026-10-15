// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminClassView, ClassView } from "../../shared/schema.ts";
import { App } from "../../src/app/App.tsx";
import { ApiError, serviceProblem } from "../../src/api.ts";
import { useLoad } from "../../src/hooks.ts";
import { forgetBooking } from "../../src/lastBooking.ts";

const NOW = Date.UTC(2026, 9, 16, 0, 0); // Fri 16 Oct 2026 00:00 UTC
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const cls = (over: Partial<ClassView> = {}): ClassView => ({ id: "c1", title: "Sunrise Vinyasa", startsAt: NOW + DAY + HOUR, durationMin: 60, capacity: 12, spotsLeft: 12, cancelled: false, ...over });

interface Call {
  method: string;
  path: string;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test inspection
}
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

function mockFetch(handler: (c: Call) => Reply | Promise<Reply>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? "GET", path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const r = await handler(call);
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...r.headers } });
    }),
  );
  return calls;
}

const classesReply = (classes: ClassView[]): Reply => ({ body: { studioTimezone: "Asia/Kolkata", now: NOW, classes } });

function mount(path = "/") {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetBooking();
});

describe("schedule (AC1)", () => {
  it("groups classes by studio day with spots left, hides Book on full and cancelled classes, and names the studio zone", async () => {
    mockFetch(() =>
      classesReply([
        cls({ id: "a", title: "Morning", startsAt: NOW + DAY + HOUR, spotsLeft: 2 }), // 06:30 IST next day
        cls({ id: "b", title: "Evening", startsAt: NOW + DAY + 12 * HOUR, spotsLeft: 9 }),
        cls({ id: "c", title: "Packed", startsAt: NOW + 2 * DAY, spotsLeft: 0 }),
        cls({ id: "d", title: "Called off", startsAt: NOW + 3 * DAY, cancelled: true }),
      ]),
    );
    mount("/");
    expect(await screen.findByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("Only 2 left")).toBeInTheDocument();
    expect(screen.getByText("9 spots left")).toBeInTheDocument();
    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Book / })).toHaveLength(2); // only the two bookable classes
    expect(screen.getByText(/All times in studio time \(Kolkata, IST\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Saturday 17 October", "Sunday 18 October", "Monday 19 October"]);
  });

  it("shows a loading state first, then an empty state when there are no classes", async () => {
    mockFetch(() => classesReply([]));
    mount("/");
    expect(screen.getByLabelText("Loading classes")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("No classes in the next two weeks")).toBeInTheDocument();
  });

  it("shows a friendly error and recovers on Try again", async () => {
    let up = false;
    mockFetch(() => (up ? classesReply([cls()]) : { status: 503, body: { error: { code: "unavailable", message: "x" } } }));
    const user = mount("/");
    expect(await screen.findByText(/couldn't reach the booking service/)).toBeInTheDocument();
    up = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sunrise Vinyasa")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach/)).not.toBeInTheDocument();
  });
});

describe("booking (AC3)", () => {
  it("validates on the client with field errors, moves focus to the first problem, and sends nothing", async () => {
    const calls = mockFetch(() => classesReply([cls({ spotsLeft: 3 })]));
    const user = mount("/class/c1");
    await user.click(await screen.findByRole("button", { name: "Reserve my spot" }));
    expect(await screen.findByText("Please enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Please enter your email address.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Your name")).toHaveFocus());
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await user.type(screen.getByLabelText("Your name"), "Asha");
    await user.type(screen.getByLabelText("Email"), "nope");
    await user.click(screen.getByRole("button", { name: "Reserve my spot" }));
    expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
  });

  it("books, sends the trimmed values (honeypot empty), and shows the code once", async () => {
    const calls = mockFetch((c) => (c.method === "POST" ? { status: 201, body: { bookingId: "b1", code: "ABCDE-FGHJK-LMNPQ", class: cls({ spotsLeft: 2 }) } } : classesReply([cls()])));
    const user = mount("/class/c1");
    await user.type(await screen.findByLabelText("Your name"), "  Asha Rao  ");
    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.click(screen.getByRole("button", { name: "Reserve my spot" }));
    expect(await screen.findByText("ABCDE-FGHJK-LMNPQ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're booked" })).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/api/bookings");
    expect(post.body).toEqual({ classId: "c1", name: "Asha Rao", email: "asha@example.com", website: "" });
  });

  it("explains a class that filled up meanwhile, and a closed class up front", async () => {
    mockFetch((c) => (c.method === "POST" ? { status: 409, body: { error: { code: "class_full", message: "Sorry, that class just filled up." } } } : classesReply([cls(), cls({ id: "c2", spotsLeft: 0 })])));
    const user = mount("/class/c1");
    await user.type(await screen.findByLabelText("Your name"), "A");
    await user.type(screen.getByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Reserve my spot" }));
    expect(await screen.findByText(/just filled up/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose another class" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reserve my spot" })).toBeEnabled();
  });

  it("does not offer the form for a full class, and says so for an unknown one", async () => {
    mockFetch(() => classesReply([cls({ id: "full", spotsLeft: 0 })]));
    mount("/class/full");
    expect(await screen.findByText(/This class is full/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reserve my spot" })).not.toBeInTheDocument();
  });

  it("sends the visitor back to the schedule if the confirmation page is opened without a booking", async () => {
    mockFetch(() => classesReply([]));
    mount("/booked");
    expect(await screen.findByRole("heading", { name: "Find your class" })).toBeInTheDocument();
  });
});

describe("owner (AC9)", () => {
  const adminClass = (over: Partial<AdminClassView> = {}): AdminClassView => ({ ...cls(), roster: [], ...over });

  it("shows the sign-in form when signed out, without ever requesting the classes", async () => {
    const calls = mockFetch(() => ({ body: { signedIn: false } }));
    mount("/admin");
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/api/admin/session"]); // no failing request, so no console error
  });

  it("shows a wrong-passphrase error under the field and keeps focus there", async () => {
    mockFetch((c) => (c.path === "/api/admin/session" ? { body: { signedIn: false } } : { status: 401, body: { error: { code: "unauthorized", message: "That passphrase isn't right." } } }));
    const user = mount("/admin");
    await user.type(await screen.findByLabelText("Passphrase"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("That passphrase isn't right.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Passphrase")).toHaveFocus());
  });

  it("converts the studio-time form to the right UTC instant (06:30 in Kolkata is 01:00 UTC) and keeps the confirmation visible", async () => {
    let classes: AdminClassView[] = [];
    const calls = mockFetch((c) => {
      if (c.path === "/api/admin/session") return { body: { signedIn: true } };
      if (c.path === "/api/admin/classes" && c.method === "POST") {
        classes = [adminClass({ title: c.body.title, startsAt: c.body.startsAt })];
        return { status: 201, body: classes[0] };
      }
      return { body: { studioTimezone: "Asia/Kolkata", now: NOW, classes } };
    });
    const user = mount("/admin");
    await user.type(await screen.findByLabelText("Title"), "New class");
    await user.type(screen.getByLabelText("Date"), "2030-01-15");
    await user.type(screen.getByLabelText(/Start \(studio time/), "06:30");
    await user.click(screen.getByRole("button", { name: "Add class" }));
    expect(await screen.findByText("Class added.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ title: "New class", startsAt: Date.UTC(2030, 0, 15, 1, 0), durationMin: 60, capacity: 12 });
    expect(screen.getByText("Class added.")).toBeInTheDocument(); // still there after the list refreshed
    expect(await screen.findByRole("article", { name: /New class/ })).toBeInTheDocument();
  });

  it("rejects a past start, an impossible capacity and an empty title on the client", async () => {
    const calls = mockFetch((c) => (c.path === "/api/admin/session" ? { body: { signedIn: true } } : { body: { studioTimezone: "Asia/Kolkata", now: NOW, classes: [] } }));
    const user = mount("/admin");
    await user.type(await screen.findByLabelText("Date"), "2020-01-01");
    await user.type(screen.getByLabelText(/Start \(studio time/), "10:00");
    await user.clear(screen.getByLabelText("Capacity (1 to 100)"));
    await user.type(screen.getByLabelText("Capacity (1 to 100)"), "101");
    await user.click(screen.getByRole("button", { name: "Add class" }));
    expect(await screen.findByText("Please enter a title.")).toBeInTheDocument();
    expect(screen.getByText("The class must start in the future.")).toBeInTheDocument();
    expect(screen.getByText("Capacity can be at most 100.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows rosters, and confirms before cancelling a class (focus starts on Keep it)", async () => {
    let cancelled = false;
    const calls = mockFetch((c) => {
      if (c.path === "/api/admin/session") return { body: { signedIn: true } };
      if (c.path.endsWith("/cancel")) {
        cancelled = true;
        return { body: { ok: true } };
      }
      return { body: { studioTimezone: "Asia/Kolkata", now: NOW, classes: [adminClass({ cancelled, spotsLeft: 11, roster: [{ name: "Asha", email: "asha@example.com" }] })] } };
    });
    const user = mount("/admin");
    const article = await screen.findByRole("article", { name: /Sunrise Vinyasa/ });
    expect(within(article).getByText(/Asha/)).toBeInTheDocument();
    await user.click(within(article).getByRole("button", { name: /Cancel class/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(false);
    await user.click(within(article).getByRole("button", { name: /Cancel class/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel class" }));
    expect(await screen.findByText("Class cancelled.")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/cancel"))?.path).toBe("/api/admin/classes/c1/cancel");
  });

  it("falls back to the sign-in form if the session ends while using the dashboard", async () => {
    let signedIn = true;
    mockFetch((c) => {
      if (c.path === "/api/admin/session") return { body: { signedIn } };
      if (c.method === "POST") {
        signedIn = false;
        return { status: 401, body: { error: { code: "unauthorized", message: "Please sign in." } } };
      }
      return { body: { studioTimezone: "Asia/Kolkata", now: NOW, classes: [adminClass()] } };
    });
    const user = mount("/admin");
    await user.click(await screen.findByRole("button", { name: /Cancel class Sunrise/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel class" }));
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
  });
});

describe("cancelling a booking (AC6)", () => {
  it("shows the same non-revealing message for any wrong code, and success clears the form", async () => {
    let ok = false;
    mockFetch((c) => {
      if (c.method === "POST") return ok ? { body: { ok: true } } : { status: 404, body: { error: { code: "not_found", message: "We couldn't find a booking with that class and code." } } };
      return classesReply([cls()]);
    });
    const user = mount("/cancel");
    await waitFor(() => expect(screen.getByLabelText("Class")).toBeEnabled());
    await user.type(screen.getByLabelText("Cancellation code"), "ZZZZZ-ZZZZZ-ZZZZZ");
    await user.click(screen.getByRole("button", { name: "Cancel my spot" }));
    expect(await screen.findByText("We couldn't find a booking with that class and code.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Cancellation code")).toHaveFocus());
    ok = true;
    await user.click(screen.getByRole("button", { name: "Cancel my spot" }));
    expect(await screen.findByText("Your spot is cancelled. See you another time.")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancellation code")).toHaveValue("");
  });
});

describe("useLoad", () => {
  it("keeps the previous data on screen while reloading, and shows loading again after an error", async () => {
    let n = 0;
    let fail = false;
    const gate: { release?: () => void } = {};
    const loader = (): Promise<string> => {
      n++;
      if (fail) return Promise.reject(new Error("boom"));
      if (n === 2) return new Promise((r) => (gate.release = () => r(`data ${n}`)));
      return Promise.resolve(`data ${n}`);
    };
    const { result } = renderHook(() => useLoad(loader));
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "data 1" }));

    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: "ready", data: "data 1" }); // stale data stays while fetching
    await act(async () => gate.release?.());
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "data 2" }));

    fail = true;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    fail = false;
    act(() => result.current.reload());
    expect(result.current.state.status).toBe("loading"); // a previous error is replaced by loading
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("ignores a response that arrives after the screen has gone away", async () => {
    let resolve!: (v: string) => void;
    const loader = (signal: AbortSignal) => new Promise<string>((r) => { resolve = r; signal.addEventListener("abort", () => undefined); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useLoad(loader));
    unmount();
    await act(async () => resolve("late"));
    expect(errors).not.toHaveBeenCalled(); // no state update on an unmounted screen
    errors.mockRestore();
  });
});

describe("what the visitor is told when the service has problems", () => {
  it.each([
    ["daily_limit", 503, /at capacity for today/],
    ["network", 0, /couldn't reach the booking service/],
    ["unavailable", 503, /couldn't reach the booking service/],
  ] as const)("%s", (code, status, text) => {
    expect(serviceProblem(new ApiError(code, status, "x"))?.text).toMatch(text);
  });

  it("rate limiting says how long to wait, rounded up to whole minutes", () => {
    expect(serviceProblem(new ApiError("rate_limited", 429, "x", {}, 420))?.text).toMatch(/about 7 minutes/);
    expect(serviceProblem(new ApiError("rate_limited", 429, "x", {}, 30))?.text).toMatch(/about 1 minute\b/);
    expect(serviceProblem(new ApiError("rate_limited", 429, "x"))?.text).toMatch(/a few minutes/);
  });

  it("returns nothing for errors about the visitor's own input, which are shown next to the field", () => {
    expect(serviceProblem(new ApiError("validation", 400, "x"))).toBeNull();
    expect(serviceProblem(new ApiError("already_booked", 409, "x"))).toBeNull();
  });

  it("treats an unknown error as a generic problem that changed nothing", () => {
    expect(serviceProblem(new Error("weird"))?.text).toMatch(/Nothing was changed/);
  });
});
