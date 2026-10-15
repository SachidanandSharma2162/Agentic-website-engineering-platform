import { test } from "@playwright/test";
import { ROUTES, SAMPLE, seed } from "./helpers.ts";

// Evidence generator, not a behavioural test: run with `SCREENSHOTS=1 npm run e2e -- screenshots`.
// Captures the real production build (not the prototype) at the three design widths.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots");

const sizes = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const { name, width, height } of sizes) {
  for (const route of ROUTES) {
    test(`screenshot ${name} ${route}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await seed(page, SAMPLE);
      await page.goto(route);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.waitForTimeout(700); // let entry animations settle
      const slug = route === "/" ? "today" : route.slice(1);
      await page.screenshot({ path: `docs/screenshots/${name}-${slug}.png`, fullPage: false });
    });
  }
}
