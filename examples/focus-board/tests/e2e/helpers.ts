import type { Page } from "@playwright/test";

export const STORAGE_KEY = "focus-board:v1";

export function localDayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface SeedData {
  version: 1;
  tasks: { id: string; title: string; priority: "high" | "normal" | "low"; done: boolean; today: boolean; createdAt: string }[];
  habits: { id: string; name: string; checkIns: string[] }[];
}

export const SAMPLE: SeedData = {
  version: 1,
  tasks: [
    { id: "t1", title: "Draft the Q4 planning outline", priority: "high", done: false, today: true, createdAt: "2025-06-15T10:00:00.000Z" },
    { id: "t2", title: "Reply to Priya about the design review", priority: "normal", done: true, today: true, createdAt: "2025-06-15T10:00:00.000Z" },
    { id: "t3", title: "Book dentist appointment", priority: "low", done: false, today: false, createdAt: "2025-06-15T10:00:00.000Z" },
  ],
  habits: [
    { id: "h1", name: "Walk for 20 minutes", checkIns: [localDayKey(-2), localDayKey(-1)] },
    { id: "h2", name: "Write in the journal", checkIns: [] },
  ],
};

/** Seed localStorage before the app loads, but only if nothing is stored yet, so reloads keep what the test did. */
export async function seed(page: Page, data: SeedData = SAMPLE): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, JSON.stringify(data)],
  );
}

export const ROUTES = ["/", "/tasks", "/habits", "/settings"] as const;
