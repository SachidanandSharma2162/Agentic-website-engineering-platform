import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { STORAGE_KEY, localDayKey, seed } from "./helpers.ts";

test.describe("tasks (AC1, AC2, AC4, AC5, AC9)", () => {
  test("add, complete, reload, delete and undo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Nothing pinned for today")).toBeVisible();

    const add = page.getByRole("textbox", { name: "New task for today" });
    await add.fill("Write the report");
    await add.press("Enter");
    await add.fill("Send the invoice");
    await add.press("Enter");
    await expect(add).toHaveValue("");

    const list = page.getByRole("list", { name: "Today's tasks" });
    await expect(list.getByRole("listitem").first()).toContainText("Send the invoice"); // newest on top
    await expect(page.getByRole("img", { name: "0 of 2 done" })).toBeVisible();

    await page.getByRole("checkbox", { name: "Mark “Write the report” as done" }).check();
    await expect(page.getByRole("img", { name: "1 of 2 done" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Mark “Write the report” as done" })).toBeChecked();
    await expect(page.getByRole("img", { name: "1 of 2 done" })).toBeVisible();

    await page.getByRole("button", { name: "Delete “Send the invoice”" }).click();
    await expect(list).not.toContainText("Send the invoice");
    await page.getByRole("button", { name: "Undo" }).click();
    const items = list.getByRole("listitem");
    await expect(items.nth(0)).toContainText("Send the invoice");
    await expect(items.nth(1)).toContainText("Write the report");
  });

  test("an empty title is rejected with a visible message", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("textbox", { name: "New task" }).fill("   ");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Enter a title first.")).toBeVisible();
  });

  test("filter and search combine, and clearing restores the list (AC6)", async ({ page }) => {
    await seed(page);
    await page.goto("/tasks");
    await expect(page.getByRole("list", { name: "Tasks" }).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("list", { name: "Tasks" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search tasks" }).fill("dentist");
    await expect(page.getByText("No matching tasks")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("list", { name: "Tasks" }).getByRole("listitem")).toHaveCount(3);
  });
});

test.describe("habits (AC7, AC8, AC9)", () => {
  test("check in extends the streak, survives reload, and unchecks", async ({ page }) => {
    await seed(page); // Walk has check-ins for the two previous days
    await page.goto("/habits");
    const card = page.getByRole("article", { name: "Walk for 20 minutes" });
    await expect(card.getByText(/current streak/).locator("b")).toHaveText("2");
    await card.getByRole("button", { name: "Check in today" }).click();
    await expect(card.getByText(/current streak/).locator("b")).toHaveText("3");
    await expect(card.getByRole("img", { name: "Last 7 days: 3 of 7 checked in" })).toBeVisible();

    await page.reload();
    await expect(card.getByRole("button", { name: "Checked in ✓" })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "Checked in ✓" }).click();
    await expect(card.getByText(/current streak/).locator("b")).toHaveText("2"); // today unchecked: run ending yesterday

    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), STORAGE_KEY);
    expect(stored.habits[0].checkIns).toEqual([localDayKey(-2), localDayKey(-1)]);
  });
});

test.describe("export, import and reset (AC10, AC11, AC12)", () => {
  test("export downloads valid JSON that re-imports to identical data", async ({ page }, testInfo) => {
    await seed(page);
    await page.goto("/settings");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON" }).click()]);
    expect(download.suggestedFilename()).toBe(`focus-board-${localDayKey()}.json`);
    const file = testInfo.outputPath("export.json");
    await download.saveAs(file);
    const exported = JSON.parse(readFileSync(file, "utf8"));
    expect(exported.version).toBe(1);
    expect(exported.tasks).toHaveLength(3);

    // Wipe, then import the exported file.
    await page.getByRole("button", { name: "Delete all data…" }).click();
    await page.getByRole("button", { name: "Delete everything" }).click();
    await page.getByRole("link", { name: "Tasks" }).click();
    await expect(page.getByText("No tasks yet")).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByLabel(/Choose a \.json file/).setInputFiles(file);
    await expect(page.getByRole("dialog")).toContainText("3 tasks and 2 habits");
    await page.getByRole("button", { name: "Replace" }).click();
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), STORAGE_KEY);
    expect(stored).toEqual(exported);
  });

  test("invalid imports show an error and change nothing", async ({ page }, testInfo) => {
    await seed(page);
    await page.goto("/settings");
    const before = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
    const cases: [string, string, RegExp][] = [
      ["not-json.json", "{definitely not json", /not valid JSON/],
      ["wrong-schema.json", JSON.stringify({ version: 1, tasks: [{ title: 5 }], habits: [] }), /invalid data/],
      ["future-version.json", JSON.stringify({ version: 7, tasks: [], habits: [] }), /unknown version/],
      ["huge.json", JSON.stringify({ version: 1, tasks: [], habits: [], pad: "x".repeat(1_100_000) }), /larger than 1 MB/],
    ];
    for (const [name, content, message] of cases) {
      const path = testInfo.outputPath(name);
      writeFileSync(path, content);
      await page.getByLabel(/Choose a \.json file/).setInputFiles(path);
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe(before);
  });

  test("reset needs confirmation, can be cancelled, and then empties everything", async ({ page }) => {
    await seed(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete all data…" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete all data…" }).click();
    await page.keyboard.press("Escape"); // Escape also cancels
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}").tasks.length, STORAGE_KEY)).toBe(3);

    await page.getByRole("button", { name: "Delete all data…" }).click();
    await page.getByRole("button", { name: "Delete everything" }).click();
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), STORAGE_KEY)).toEqual({ version: 1, tasks: [], habits: [] });
  });
});

test.describe("resilience (AC9, R3)", () => {
  test("corrupt stored data does not crash the app; it starts empty with a notice", async ({ page }) => {
    await page.addInitScript((k) => localStorage.setItem(k, "{corrupt"), STORAGE_KEY);
    await page.goto("/");
    await expect(page.getByText(/saved data was unreadable/)).toBeVisible();
    await expect(page.getByText("Nothing pinned for today")).toBeVisible();
  });
});

test.describe("routing (AC13)", () => {
  for (const [path, heading] of [
    ["/tasks", "Tasks"],
    ["/habits", "Habits"],
    ["/settings", "Settings"],
  ] as const) {
    test(`direct load and refresh of ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(`${heading} · Focus Board`);
    });
  }

  test("unknown routes show a helpful not-found page", async ({ page }) => {
    const response = await page.goto("/definitely/not/a/page");
    expect(response?.status()).toBe(200); // SPA fallback serves the app shell
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await page.getByRole("link", { name: "Back to Today" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
