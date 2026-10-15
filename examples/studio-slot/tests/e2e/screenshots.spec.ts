import { test } from "@playwright/test";
import { bookViaApi, createClass, ownerSignIn, HOUR } from "./helpers.ts";

// Evidence generator, not a behavioural test: run with `SCREENSHOTS=1 npm run e2e -- screenshots`.
// Captures the real built app (not the prototype) at the three design widths.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots");

const sizes = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const { name, width, height } of sizes) {
  test(`screenshots ${name}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    const open = await createClass(request, { title: "Gentle Flow", capacity: 10, inMs: 30 * HOUR });
    const few = await createClass(request, { title: "Sunrise Vinyasa", capacity: 3, inMs: 28 * HOUR });
    const full = await createClass(request, { title: "Yin and Restore", capacity: 1, inMs: 31 * HOUR });
    await bookViaApi(request, full.id, "someone@example.com", "Someone");
    await bookViaApi(request, few.id, "a@example.com", "Asha Rao");
    const gone = await createClass(request, { title: "Moon Flow", inMs: 33 * HOUR });
    await request.post(`/api/admin/classes/${gone.id}/cancel`, { headers: { "x-requested-with": "studio-slot" } });

    const shot = async (slug: string) => {
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `docs/screenshots/${name}-${slug}.png` });
    };

    await page.goto("/");
    await page.getByText("Gentle Flow").first().waitFor();
    await shot("schedule");

    await page.goto(`/class/${open.id}`); // this run's own class, so repeated runs never collide
    await page.getByLabel("Your name").waitFor();
    await page.getByRole("button", { name: "Reserve my spot" }).click(); // show the validation state
    await page.getByText("Please enter your name.").waitFor();
    await shot("book-errors");

    await page.getByLabel("Your name").fill("Asha Rao");
    await page.getByLabel("Email").fill(`asha.rao.${name}@example.com`);
    await page.getByRole("button", { name: "Reserve my spot" }).click();
    await page.getByRole("heading", { name: "You're booked" }).waitFor();
    await shot("confirmed");

    await page.goto("/cancel");
    await page.getByLabel("Cancellation code").waitFor();
    await shot("cancel");

    await page.goto("/admin");
    await page.getByLabel("Passphrase").waitFor();
    await shot("admin-login");

    await ownerSignIn(page);
    await page.locator("article").first().waitFor();
    await shot("admin");
  });
}
