import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ROUTES, seed } from "./helpers.ts";

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) }));
}

test.describe("accessibility (AC14)", () => {
  for (const route of ROUTES) {
    test(`axe: no serious or critical violations on ${route}`, async ({ page }) => {
      await seed(page);
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    });
  }

  test("axe: empty states, edit mode, toast and confirmation dialog", async ({ page }) => {
    await page.goto("/tasks"); // empty
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.goto("/habits");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.goto("/tasks");
    await page.getByRole("textbox", { name: "New task" }).fill("Axe me");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Edit “Axe me”" }).click();
    expect(await axeSeriousOrCritical(page)).toEqual([]); // edit mode
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Delete “Axe me”" }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]); // toast visible

    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete all data…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]); // modal open
  });

  test("everything is keyboard operable, and every focusable element shows a visible focus ring", async ({ page }) => {
    await seed(page);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // Tab only works once the page has rendered

    // Walk the whole tab order; each stop must have a visible outline.
    const stops: { tag: string; outline: string; width: string }[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return { tag: `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`, outline: cs.outlineStyle, width: cs.outlineWidth };
      });
      if (!info) break;
      stops.push(info);
    }
    expect(stops.length).toBeGreaterThan(10);
    for (const s of stops) {
      expect(s.outline, `focus ring missing on ${s.tag}`).not.toBe("none");
      expect(parseFloat(s.width), `focus ring too thin on ${s.tag}`).toBeGreaterThanOrEqual(2);
    }

    // Operate by keyboard only: add a task, tick it, delete it, undo it.
    await page.getByRole("textbox", { name: "New task" }).focus();
    await page.keyboard.type("Keyboard only");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Tasks" })).toContainText("Keyboard only");
    const check = page.getByRole("checkbox", { name: "Mark “Keyboard only” as done" });
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    const del = page.getByRole("button", { name: "Delete “Keyboard only”" });
    await del.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Tasks" })).not.toContainText("Keyboard only");
    await page.getByRole("button", { name: "Undo" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Tasks" })).toContainText("Keyboard only");
  });

  test("the confirmation dialog traps focus, starts on Cancel and returns focus to its trigger", async ({ page }) => {
    await page.goto("/settings");
    const trigger = page.getByRole("button", { name: "Delete all data…" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    // A native modal makes the page behind it inert: Tab cycles the dialog buttons and then leaves the page for the browser UI
    // (document.body is reported as active). It must never land on an element of the page behind the dialog.
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

  test("prefers-reduced-motion disables CSS animation and transitions", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("textbox", { name: "New task for today" }).fill("Motion check");
    await page.keyboard.press("Enter");
    const durations = await page.evaluate(() => {
      const ring = getComputedStyle(document.querySelector(".progress-ring .fg")!);
      const btn = getComputedStyle(document.querySelector(".btn")!);
      return { ring: ring.transitionDuration, btn: btn.transitionDuration };
    });
    expect(durations.ring).toBe("0s");
    expect(durations.btn).toBe("0s");
    await ctx.close();
  });
});

test.describe("responsive layout (AC15)", () => {
  const sizes = [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ];
  for (const { name, width, height } of sizes) {
    for (const route of ROUTES) {
      test(`${name} ${width}px ${route}: no horizontal scroll or overflowing elements`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await seed(page);
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const r = await page.evaluate(() => {
          const de = document.documentElement;
          const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => getComputedStyle(el).position !== "fixed" && el.getBoundingClientRect().right > de.clientWidth + 0.5 && el.getBoundingClientRect().width > 0)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
          return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 5) };
        });
        expect(r.scrollWidth).toBeLessThanOrEqual(r.clientWidth);
        expect(r.offenders).toEqual([]);
      });
    }
  }

  test("navigation adapts: bottom tabs on mobile, left rail on desktop", async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const mobileNav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
    expect(mobileNav!.y).toBeGreaterThan(600); // pinned to the bottom
    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopNav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
    expect(desktopNav!.x).toBe(0);
    expect(desktopNav!.width).toBeLessThan(300); // a side rail
  });
});

test.describe("production build hygiene (AC16)", () => {
  test("no console errors, failed requests or cross-origin requests on any route", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));
    page.on("request", (r) => {
      if (!r.url().startsWith("data:") && !r.url().startsWith("blob:") && new URL(r.url()).origin !== origin) problems.push(`cross-origin: ${r.url()}`);
    });
    page.on("response", (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));
    // CSP violations are not always surfaced as console errors (Chrome did not, Firefox did), so listen for the event itself.
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await seed(page);
    for (const route of [...ROUTES, "/no-such-page"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
      if (csp.length) problems.push(`${route}: CSP violations: ${csp.join("; ")}`);
    }
    expect(problems).toEqual([]);
  });
});

// Regression tests for defects that every behavioural check missed and that were only visible in the screenshots:
// a Tailwind utility collision drew a box around the progress ring, a CSS override left the arc undrawn, and
// narrow screens broke habit names mid-word.
test.describe("visual integrity", () => {
  test("the progress ring draws an arc proportional to progress, with no stray box", async ({ page }) => {
    await seed(page); // seed data: 1 of 2 pinned tasks done
    await page.goto("/");
    await expect(page.getByRole("img", { name: "1 of 2 done" })).toBeVisible(); // wait for first render before measuring
    const ring = await page.evaluate(() => {
      const fg = getComputedStyle(document.querySelector(".progress-ring .fg")!);
      return { dash: parseFloat(fg.strokeDasharray), offset: parseFloat(fg.strokeDashoffset), shadow: getComputedStyle(document.querySelector(".progress-ring")!).boxShadow };
    });
    expect(ring.dash).toBeGreaterThan(200);
    expect(ring.offset / ring.dash).toBeCloseTo(0.5, 2); // half of the ring is drawn
    expect(ring.shadow).toBe("none");

    await page.getByRole("checkbox", { name: /Mark “Draft the Q4/ }).check();
    await expect(page.getByRole("img", { name: "2 of 2 done" })).toBeVisible();
    // The arc animates for 0.5 s, so wait for it to settle rather than sampling mid-transition.
    await expect
      .poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".progress-ring .fg")!).strokeDashoffset)), { timeout: 3000 })
      .toBeCloseTo(0, 1); // fully drawn
  });

  test("habit names wrap at word boundaries on a phone instead of breaking mid-word", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page);
    await page.goto("/habits");
    await expect(page.getByRole("heading", { name: "Walk for 20 minutes" })).toBeVisible();
    const { height, lineHeight } = await page.evaluate(() => {
      const h = getComputedStyle(document.querySelector(".habit h2")!);
      return { height: document.querySelector(".habit h2")!.getBoundingClientRect().height, lineHeight: parseFloat(h.lineHeight) };
    });
    expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1); // "Walk for 20 minutes" takes at most two lines
  });
});

test("on a tablet with little content the top bar keeps its natural height instead of stretching", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/"); // empty data: very short page
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const nav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  expect(nav!.height).toBeLessThan(90);
  const main = await page.getByRole("main").boundingBox();
  expect(main!.y).toBeLessThan(100); // content starts right under the bar
});

test("security headers from public/_headers are served (locally by vite preview, in production by Cloudflare Pages)", async ({ page }) => {
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("script-src 'self'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["permissions-policy"]).toContain("camera=()");
});
