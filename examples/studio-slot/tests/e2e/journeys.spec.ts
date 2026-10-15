import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { bookViaApi, bookViaUi, card, CODE, createClass, ownerSignIn, selectClass, uniq } from "./helpers.ts";

test.describe("visitor journey (AC1, AC3, AC6, AC7)", () => {
  test("see a class, book it, get a code and a calendar file, then cancel with the code", async ({ page, request }, testInfo) => {
    const c = await createClass(request, { capacity: 2 });
    await page.goto("/");
    await expect(card(page, c.title)).toContainText("Only 2 left");

    const code = await bookViaUi(page, c.title, "Asha Rao", `asha.${uniq()}@example.com`);
    expect(code).toMatch(CODE);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Add to calendar" }).click()]);
    expect(download.suggestedFilename()).toBe("studio-slot-class.ics");
    const file = testInfo.outputPath("class.ics");
    await download.saveAs(file);
    const ics = readFileSync(file, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`SUMMARY:${c.title}`);
    expect(ics).not.toMatch(/asha|example\.com/i); // no personal data in the file

    await page.getByRole("link", { name: "Back to schedule" }).click();
    await expect(card(page, c.title)).toContainText("Only 1 left");

    await page.getByRole("link", { name: "Cancel a booking", exact: true }).click();
    await selectClass(page, c.title);
    await page.getByLabel("Cancellation code").fill(code);
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("Your spot is cancelled")).toBeVisible();

    await page.getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(card(page, c.title)).toContainText("Only 2 left");
  });

  test("the code is shown once: reloading the confirmation sends you back to the schedule", async ({ page, request }) => {
    const c = await createClass(request);
    await bookViaUi(page, c.title, "Once Only", `once.${uniq()}@example.com`);
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Find your class" })).toBeVisible();
  });

  test("a full class shows Full and offers no Book link; a cancelled one is struck through", async ({ page, request }) => {
    const full = await createClass(request, { capacity: 1 });
    await bookViaApi(request, full.id);
    const gone = await createClass(request);
    await request.post(`/api/admin/classes/${gone.id}/cancel`, { headers: { "x-requested-with": "studio-slot" } });
    await page.goto("/");
    await expect(card(page, full.title)).toContainText("Full");
    await expect(card(page, full.title).getByRole("link", { name: /^Book/ })).toHaveCount(0);
    await expect(card(page, gone.title)).toContainText("Cancelled");
    await expect(card(page, gone.title).getByRole("link", { name: /^Book/ })).toHaveCount(0);
  });
});

test.describe("booking form (AC3, AC5)", () => {
  test("empty and invalid input shows field errors and moves focus to the first problem", async ({ page, request }) => {
    const c = await createClass(request);
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeFocused();
    await page.getByLabel("Your name").fill("Asha");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("the same email cannot book the same class twice", async ({ page, request }) => {
    const c = await createClass(request);
    const email = `dup.${uniq()}@example.com`;
    await bookViaApi(request, c.id, email);
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await page.getByLabel("Your name").fill("Dup");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("This email already has a spot in this class.")).toBeVisible();
  });

  test("if the class fills up while the visitor is typing, they get a clear message and a way out", async ({ page, request }) => {
    const c = await createClass(request, { capacity: 1 });
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await page.getByLabel("Your name").fill("Slow Typer");
    await page.getByLabel("Email").fill(`slow.${uniq()}@example.com`);
    await bookViaApi(request, c.id); // someone else takes the last spot first
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("just filled up")).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose another class" })).toBeVisible();
  });

  test("hidden honeypot field is not reachable by keyboard or exposed to assistive technology", async ({ page, request }) => {
    const c = await createClass(request);
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await expect(page.getByRole("button", { name: "Reserve my spot" })).toBeVisible(); // wait for the form to render
    await expect(page.getByRole("textbox", { name: /Leave this empty/ })).toHaveCount(0); // aria-hidden: not in the accessibility tree
    const tabbable = await page.evaluate(() => (document.querySelector("input[name=website]") as HTMLInputElement).tabIndex);
    expect(tabbable).toBe(-1);
  });
});

test.describe("cancelling (AC6)", () => {
  test("a wrong code gives one non-revealing message; the right code works once", async ({ page, request }) => {
    const c = await createClass(request);
    const code = await bookViaApi(request, c.id);
    await page.goto("/cancel");
    await selectClass(page, c.title);
    await page.getByLabel("Cancellation code").fill("ZZZZZ-ZZZZZ-ZZZZZ");
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("We couldn't find a booking with that class and code.")).toBeVisible();
    await expect(page.getByLabel("Cancellation code")).toBeFocused();

    await page.getByLabel("Cancellation code").fill(code);
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("Your spot is cancelled")).toBeVisible();

    await selectClass(page, c.title);
    await page.getByLabel("Cancellation code").fill(code);
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("We couldn't find a booking with that class and code.")).toBeVisible(); // a code works once
  });

  test("an empty code is rejected with a message", async ({ page }) => {
    await page.goto("/cancel");
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("Please enter your code.")).toBeVisible();
  });
});

test.describe("owner (AC8, AC9)", () => {
  test("a wrong passphrase is refused; the right one opens the classes; the session survives a reload; sign out ends it", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Owner sign in" })).toBeVisible();
    await page.getByLabel("Passphrase").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That passphrase isn't right.")).toBeVisible();

    await ownerSignIn(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Owner sign in" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Owner sign in" })).toBeVisible();
  });

  test("add a class in studio time, see it on the public schedule, see its roster, then cancel it", async ({ page, request }) => {
    const title = `Owner class ${uniq()}`;
    const tomorrow = new Date(Date.now() + 36 * 3_600_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await ownerSignIn(page);

    // Validation first.
    await page.getByRole("button", { name: "Add class" }).click();
    await expect(page.getByText("Please enter a title.")).toBeVisible();
    await expect(page.getByText("Pick a date.")).toBeVisible();
    await expect(page.getByText("Pick a start time.")).toBeVisible();

    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Date", { exact: true }).fill(tomorrow);
    await page.getByLabel(/Start \(studio time/).fill("18:30");
    await page.getByLabel("Capacity").fill("3");
    await page.getByRole("button", { name: "Add class" }).click();
    await expect(page.getByText("Class added.")).toBeVisible();

    const row = page.locator("article", { hasText: title });
    await expect(row).toContainText("6:30 PM IST");
    await expect(row).toContainText("0/3 booked");

    await page.getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(card(page, title)).toContainText("6:30 PM");
    await expect(card(page, title)).toContainText("Only 3 left");

    const listed = await (await request.get("/api/classes")).json();
    const id = (listed.classes as { id: string; title: string }[]).find((x) => x.title === title)!.id;
    await bookViaApi(request, id, `roster.${uniq()}@example.com`, "Roster Person");

    await page.getByRole("link", { name: "Owner", exact: true }).click();
    await expect(page.locator("article", { hasText: title })).toContainText("Roster Person");

    await page.getByRole("button", { name: new RegExp(`Cancel class ${title}`) }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep it" })).toBeFocused(); // focus starts on the safe choice
    await page.getByRole("dialog").getByRole("button", { name: "Cancel class" }).click();
    await expect(page.getByText("Class cancelled.")).toBeVisible();
    await expect(page.locator("article", { hasText: title })).toContainText("Cancelled");
    await expect(page.locator("article", { hasText: title })).toContainText("Roster Person"); // bookings stay visible

    await page.getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(card(page, title)).toContainText("Cancelled");
  });

  test("keeping a class in the confirmation dialog changes nothing, and Escape also keeps it", async ({ page, request }) => {
    const c = await createClass(request);
    await ownerSignIn(page);
    const row = page.locator("article", { hasText: c.title });
    await row.getByRole("button", { name: /Cancel class/ }).click();
    await page.getByRole("button", { name: "Keep it" }).click();
    await row.getByRole("button", { name: /Cancel class/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).not.toContainText("Cancelled");
  });

  test("a class cannot be added in the past", async ({ page }) => {
    await ownerSignIn(page);
    await page.getByLabel("Title", { exact: true }).fill("Back in time");
    await page.getByLabel("Date", { exact: true }).fill("2020-01-01");
    await page.getByLabel(/Start \(studio time/).fill("10:00");
    await page.getByRole("button", { name: "Add class" }).click();
    await expect(page.getByText("The class must start in the future.")).toBeVisible();
  });
});

test.describe("time zones (AC2)", () => {
  // Expected values come from Intl directly, independent of the app's own helpers.
  const clock = (ms: number, tz: string) => new Date(ms).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).replace(/[\u202f\u00a0]/g, " ");

  test("a visitor in the studio's zone sees only studio time", async ({ browser, request }) => {
    const c = await createClass(request);
    const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(card(page, c.title)).toContainText(clock(c.startsAt, "Asia/Kolkata"));
    await expect(card(page, c.title)).not.toContainText("your time");
    await ctx.close();
  });

  test("a visitor in another zone also sees their own local time", async ({ browser, request }) => {
    const c = await createClass(request);
    const ctx = await browser.newContext({ timezoneId: "America/New_York" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(card(page, c.title)).toContainText(`${clock(c.startsAt, "America/New_York")} your time`);
    await expect(page.getByText(/All times in studio time \(Kolkata, IST\)/)).toBeVisible();
    await ctx.close();
  });
});

test.describe("routing and metadata (AC13)", () => {
  for (const [path, heading, title] of [
    ["/", "Find your class", "Class schedule"],
    ["/cancel", "Cancel a booking", "Cancel a booking"],
    ["/admin", "Owner sign in", "Owner"],
  ] as const) {
    test(`direct load and refresh of ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(`${title} · Studio Slot`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
      await expect(page.getByRole("link", { name: /Schedule|Cancel a booking|Owner/ }).and(page.locator('[aria-current="page"]'))).toHaveCount(1);
    });
  }

  test("a class link opens the booking page directly, and an unknown class is explained", async ({ page, request }) => {
    const c = await createClass(request);
    await page.goto(`/class/${c.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
    await expect(page).toHaveTitle("Book a class · Studio Slot");
    await page.goto("/class/does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that class");
  });

  test("unknown routes show a helpful not-found page", async ({ page }) => {
    await page.goto("/no/such/page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await page.getByRole("link", { name: "Back to the schedule" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your class");
  });

  test("navigation moves focus to the main region", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Cancel a booking", exact: true }).click();
    await expect(page.getByRole("main")).toBeFocused();
  });
});

test.describe("when the service has problems (AC10)", () => {
  test("an outage shows a friendly message, and Try again recovers once the service is back", async ({ page }) => {
    await page.route("**/api/classes", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "x" } }) }));
    await page.goto("/");
    await expect(page.getByText("We couldn't reach the booking service.")).toBeVisible();
    await page.unroute("**/api/classes");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Find your class" })).toBeVisible();
    await expect(page.getByText("We couldn't reach the booking service.")).toHaveCount(0);
  });

  test("Cloudflare's daily request limit (a non-JSON 429) is explained as a capacity limit", async ({ page }) => {
    await page.route("**/api/classes", (r) => r.fulfill({ status: 429, contentType: "text/html", body: "<html>error code: 1027</html>" }));
    await page.goto("/");
    await expect(page.getByText("We're at capacity for today")).toBeVisible();
  });

  test("being rate limited while booking says how long to wait", async ({ page, request }) => {
    const c = await createClass(request);
    await page.route("**/api/bookings", (r) =>
      r.fulfill({ status: 429, headers: { "retry-after": "420" }, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "Too many attempts." } }) }),
    );
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await page.getByLabel("Your name").fill("Eager");
    await page.getByLabel("Email").fill(`eager.${uniq()}@example.com`);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText(/wait about 7 minutes/)).toBeVisible();
  });

  test("a failed booking request leaves the form usable and says nothing was booked", async ({ page, request }) => {
    const c = await createClass(request);
    await page.route("**/api/bookings", (r) => r.abort("connectionrefused"));
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await page.getByLabel("Your name").fill("Offline");
    await page.getByLabel("Email").fill(`offline.${uniq()}@example.com`);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("Nothing was changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reserve my spot" })).toBeEnabled();
  });
});
