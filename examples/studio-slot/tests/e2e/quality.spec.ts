import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bookViaApi, bookViaUi, card, createClass, ownerSignIn, ROUTES, selectClass, uniq } from "./helpers.ts";

async function seriousOrCritical(page: Page) {
  // Cards fade in; a scan taken mid-fade sees half-transparent text and can report a contrast failure that no user ever sees.
  // Wait for every finite animation to finish first (the endless "breathing" circle only changes size, not colour).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) }));
}

/** How many lines of text an element's content occupies (a box's height also includes padding, so it cannot answer this). */
function textLines(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(`[data-testid=${id}]`)!);
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  }, testId);
}

/** Make sure the schedule has a spread of states (open, few left, full, cancelled) for the checks below. */
async function seedStates(request: Parameters<typeof createClass>[0]) {
  const open = await createClass(request, { capacity: 12 });
  const few = await createClass(request, { capacity: 3 });
  const full = await createClass(request, { capacity: 1 });
  await bookViaApi(request, full.id);
  const gone = await createClass(request);
  await request.post(`/api/admin/classes/${gone.id}/cancel`, { headers: { "x-requested-with": "studio-slot" } });
  return { open, few, full, gone };
}

test.describe("accessibility (AC12)", () => {
  test("axe: no serious or critical violations on the schedule with every class state", async ({ page, request }) => {
    await seedStates(request);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Find your class" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
  });

  test("axe: booking form (empty, with errors), confirmation, and cancel page", async ({ page, request }) => {
    const c = await createClass(request);
    await page.goto("/");
    await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
    await expect(page.getByRole("button", { name: "Reserve my spot" })).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]); // error state

    await page.getByLabel("Your name").fill("Axe Tester");
    await page.getByLabel("Email").fill(`axe.${uniq()}@example.com`);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]); // confirmation

    await page.goto("/cancel");
    await expect(page.getByLabel("Cancellation code")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
    await page.getByRole("button", { name: "Cancel my spot" }).click();
    await expect(page.getByText("Please enter your code.")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]); // error state
  });

  test("axe: owner sign in, dashboard with a roster, add-class errors, and the confirmation dialog", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page.getByLabel("Passphrase")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);

    const c = await createClass(request);
    await bookViaApi(request, c.id, `roster.${uniq()}@example.com`, "Roster Person");
    await ownerSignIn(page);
    await expect(page.locator("article", { hasText: c.title })).toContainText("Roster Person");
    expect(await seriousOrCritical(page)).toEqual([]);

    await page.getByRole("button", { name: "Add class" }).click();
    await expect(page.getByText("Pick a date.")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);

    await page.locator("article", { hasText: c.title }).getByRole("button", { name: /Cancel class/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
  });

  test("axe: the not-found page and the service-problem states", async ({ page }) => {
    await page.goto("/nowhere");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
    await page.route("**/api/classes", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "x" } }) }));
    await page.goto("/");
    await expect(page.getByText("We couldn't reach the booking service.")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
  });

  test("a visitor can book and then cancel using only the keyboard, and every tab stop has a visible focus ring", async ({ page, request, browserName }) => {
    const c = await createClass(request);
    await page.goto("/");
    await expect(card(page, c.title)).toBeVisible();

    if (browserName === "webkit") {
      // Playwright's WebKit build does not Tab onto links (Safari's default: links need Option+Tab). Link focus rings are
      // checked in Chrome and Firefox; WebKit still runs the keyboard-only booking flow below by focusing links directly.
      test.info().annotations.push({ type: "note", description: "WebKit: links are not in the default Tab order, so the tab-stop ring walk is skipped" });
    } else {
      // Every stop in the tab order of the schedule must show a clear focus ring.
      const stops: { tag: string; outline: string; width: string }[] = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          return { tag: `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 30)}`, outline: cs.outlineStyle, width: cs.outlineWidth };
        });
        if (!info) break;
        stops.push(info);
      }
      expect(stops.length).toBeGreaterThan(5);
      for (const s of stops) {
        expect(s.outline, `focus ring missing on ${s.tag}`).not.toBe("none");
        expect(parseFloat(s.width), `focus ring too thin on ${s.tag}`).toBeGreaterThanOrEqual(2);
      }
    }

    // Keyboard-only booking.
    await card(page, c.title).getByRole("link", { name: /^Book/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
    await page.getByLabel("Your name").focus();
    await page.keyboard.type("Keyboard Visitor");
    await page.keyboard.press("Tab");
    await page.keyboard.type(`kbd.${uniq()}@example.com`);
    await page.keyboard.press("Enter"); // submits the form
    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
    const code = (await page.getByTestId("code").innerText()).trim();

    // Keyboard-only cancellation.
    await page.getByRole("link", { name: "Cancel a booking", exact: true }).focus();
    await page.keyboard.press("Enter");
    await selectClass(page, c.title);
    await page.getByLabel("Cancellation code").focus();
    await page.keyboard.type(code);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Your spot is cancelled")).toBeVisible();
  });

  test("the confirmation dialog traps focus, starts on the safe choice, and returns focus to its trigger", async ({ page, request }) => {
    const c = await createClass(request);
    await ownerSignIn(page);
    const trigger = page.locator("article", { hasText: c.title }).getByRole("button", { name: /Cancel class/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Keep it" })).toBeFocused();
    // A native modal makes the page behind it inert: Tab cycles the dialog's buttons and then leaves the page for the
    // browser UI (document.body is reported as active). It must never land on an element of the page behind it.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return a === document.body ? "browser-ui" : a?.closest("dialog") ? "dialog" : `page:${a?.tagName}`;
      });
      expect(["dialog", "browser-ui"], `focus escaped to ${where}`).toContain(where);
    }
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("buttons never cross-fade their colours (halfway through, white text on a pale background fails contrast)", async ({ page, request }) => {
    const c = await createClass(request);
    await page.goto("/");
    await expect(card(page, c.title)).toBeVisible();
    const props = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".btn")].map((b) => getComputedStyle(b).transitionProperty));
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(p, "only transform may animate").not.toMatch(/all|color|background|border/);
  });

  test("prefers-reduced-motion disables animation and transitions", async ({ browser, request }) => {
    const c = await createClass(request);
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(card(page, c.title)).toBeVisible();
    const m = await page.evaluate(() => {
      const btn = getComputedStyle(document.querySelector(".btn")!);
      const cls = getComputedStyle(document.querySelector("article.cls")!);
      return { btnTransition: btn.transitionDuration, cardAnimation: cls.animationName };
    });
    expect(m.btnTransition).toBe("0s");
    expect(m.cardAnimation).toBe("none");
    await ctx.close();
  });
});

test.describe("responsive layout (AC13)", () => {
  const sizes = [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ];
  for (const { name, width, height } of sizes) {
    test(`${name} ${width}px: no horizontal scroll or overflowing element on every screen`, async ({ page, request }) => {
      await page.setViewportSize({ width, height });
      const c = await createClass(request, { title: `Responsive check class with a fairly long title ${uniq()}`, capacity: 3 });
      await seedStates(request);
      const overflow = async (label: string) => {
        const r = await page.evaluate(() => {
          const de = document.documentElement;
          const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => getComputedStyle(el).position !== "fixed" && el.getBoundingClientRect().right > de.clientWidth + 0.5 && el.getBoundingClientRect().width > 0)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
          return { sw: de.scrollWidth, cw: de.clientWidth, offenders: offenders.slice(0, 5) };
        });
        expect(r.sw, `${label}: scrollWidth`).toBeLessThanOrEqual(r.cw);
        expect(r.offenders, `${label}: overflowing elements`).toEqual([]);
      };

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await overflow(route);
      }
      await page.goto("/");
      await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
      await expect(page.getByRole("button", { name: "Reserve my spot" })).toBeVisible();
      await overflow("booking form");
      await page.getByLabel("Your name").fill("Responsive");
      await page.getByLabel("Email").fill(`resp.${uniq()}@example.com`);
      await page.getByRole("button", { name: "Reserve my spot" }).click();
      await expect(page.getByTestId("code")).toBeVisible();
      await overflow("confirmation");
      expect(await textLines(page, "code"), "the cancellation code must stay on one line").toBe(1);

      await ownerSignIn(page);
      await expect(page.locator("article").first()).toBeVisible();
      await overflow("owner dashboard");
    });
  }

  // Linux and many Android phones have none of the design's preferred fonts (Optima, Candara), so the browser falls back to a
  // wider system font. Forcing one here keeps the layout honest on machines that happen to have the nice fonts installed.
  test("layout holds with a wide fallback font: no horizontal scroll, cancellation code on one line, nav on one row from 375 px", async ({ page, request }) => {
    const c = await createClass(request, { title: `Wide font class ${uniq()}`, capacity: 3 });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = '* { font-family: Verdana, "DejaVu Sans", sans-serif !important }';
        document.head.append(style);
      });
    });
    const scrolls = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 812 });
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await scrolls(), `${width}px ${route} scrolls horizontally`).toBe(false);
        if (width >= 375) {
          const tops = await page.locator("nav a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
          expect(new Set(tops).size, `${width}px nav wraps`).toBe(1);
        }
      }
      await page.goto("/");
      await card(page, c.title).getByRole("link", { name: /^Book/ }).click();
      await page.getByLabel("Your name").fill("Wide Font");
      await page.getByLabel("Email").fill(`wide.${width}.${uniq()}@example.com`);
      await page.getByRole("button", { name: "Reserve my spot" }).click();
      await expect(page.getByTestId("code")).toBeVisible();
      expect(await textLines(page, "code"), `${width}px: the cancellation code must not wrap`).toBe(1);
      expect(await scrolls(), `${width}px confirmation scrolls horizontally`).toBe(false);
    }
  });

  test("navigation pills share one row on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const tops = await page.locator("nav a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe("production build hygiene (AC14)", () => {
  test("no console errors, CSP violations, failed or cross-origin requests on any screen", async ({ page, request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));
    page.on("request", (r) => {
      if (!r.url().startsWith("data:") && !r.url().startsWith("blob:") && new URL(r.url()).origin !== origin) problems.push(`cross-origin: ${r.url()}`);
    });
    // CSP violations are not always surfaced as console errors, so listen for the event itself.
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const csp = async (where: string) => {
      const v = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
      if (v.length) problems.push(`${where}: CSP violations: ${v.join("; ")}`);
    };

    const c = await createClass(request);
    for (const route of [...ROUTES, "/nowhere", `/class/${c.id}`]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await csp(route);
    }
    await bookViaUi(page, c.title, "Hygiene", `hyg.${uniq()}@example.com`);
    await csp("booked");
    await ownerSignIn(page);
    await expect(page.locator("article", { hasText: c.title })).toBeVisible();
    await csp("admin");
    expect(problems).toEqual([]);
  });

  test("security headers from public/_headers are served on the app shell", async ({ page }) => {
    const res = await page.goto("/");
    const h = res!.headers();
    expect(h["content-security-policy"]).toContain("script-src 'self'");
    expect(h["content-security-policy"]).toContain("connect-src 'self'");
    expect(h["content-security-policy"]).not.toContain("unsafe-eval");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toContain("camera=()");
  });

  test("API responses are never cached, and the owner cookie is scoped, HttpOnly and SameSite=Strict", async ({ request }) => {
    const classes = await request.get("/api/classes");
    expect(classes.headers()["cache-control"]).toBe("no-store");
    const login = await request.post("/api/admin/login", { data: { passphrase: process.env.E2E_ADMIN_PASSPHRASE ?? "e2e-passphrase" } });
    const cookie = login.headers()["set-cookie"] ?? "";
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/admin/);
  });

  test("the session cookie is not readable by page scripts", async ({ page }) => {
    await ownerSignIn(page);
    expect(await page.evaluate(() => document.cookie)).not.toContain("studio_admin");
  });

  test("a missing script is never served as script content", async ({ request }) => {
    // Cloudflare Pages answers unknown paths with the app shell (status 200, HTML) so client-side routes work; the local
    // server answers 404. Either is acceptable. What must never happen is a made-up path coming back as JavaScript.
    const res = await request.get("/assets/definitely-missing.js");
    expect([200, 404]).toContain(res.status());
    expect(res.headers()["content-type"] ?? "").not.toMatch(/javascript/);
  });
});
