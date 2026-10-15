import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const ADMIN = process.env.E2E_ADMIN_PASSPHRASE ?? "e2e-passphrase";
export const CODE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;
export const HOUR = 3_600_000;
export const ROUTES = ["/", "/cancel", "/admin"] as const;

export const uniq = (): string => Math.random().toString(36).slice(2, 8);

export interface MadeClass {
  id: string;
  title: string;
  startsAt: number;
}

/** Create a class through the real owner API. Titles are unique so parallel tests do not collide. */
export async function createClass(request: APIRequestContext, over: Partial<{ title: string; inMs: number; capacity: number; durationMin: number }> = {}): Promise<MadeClass> {
  const login = await request.post("/api/admin/login", { data: { passphrase: ADMIN } });
  expect(login.ok(), `owner login failed (${login.status()}); set E2E_ADMIN_PASSPHRASE when testing a live site`).toBe(true);
  const title = over.title ?? `E2E ${uniq()}`;
  const startsAt = Date.now() + (over.inMs ?? 2 * 24 * HOUR);
  const r = await request.post("/api/admin/classes", {
    data: { title, startsAt, durationMin: over.durationMin ?? 60, capacity: over.capacity ?? 5 },
    headers: { "x-requested-with": "studio-slot" },
  });
  expect(r.status(), await r.text()).toBe(201);
  return { id: ((await r.json()) as { id: string }).id, title, startsAt };
}

export async function bookViaApi(request: APIRequestContext, classId: string, email = `${uniq()}@example.com`, name = "Api Guest"): Promise<string> {
  const r = await request.post("/api/bookings", { data: { classId, name, email } });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { code: string }).code;
}

/** The schedule card for a class (cards are articles containing the unique title). */
export const card = (page: Page, title: string) => page.locator("article", { hasText: title });

/** Book through the UI: open the schedule, click Book on the card, fill the form and submit. */
export async function bookViaUi(page: Page, title: string, name: string, email: string): Promise<string> {
  await page.goto("/");
  await card(page, title).getByRole("link", { name: /^Book/ }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Reserve my spot" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  return (await page.getByTestId("code").innerText()).trim();
}

/** Sign in as the owner through the UI. */
export async function ownerSignIn(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.getByLabel("Passphrase").fill(ADMIN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
}

/** Choose the class with this title in the cancel form's select. */
export async function selectClass(page: Page, title: string): Promise<void> {
  const select = page.getByLabel("Class");
  await expect(select).toBeEnabled(); // the list loads asynchronously
  const options = async () => select.locator("option").allInnerTexts();
  await expect.poll(async () => (await options()).some((t) => t.includes(title)), { message: `"${title}" should be in the class list` }).toBe(true);
  await select.selectOption({ index: (await options()).findIndex((t) => t.includes(title)) });
}
