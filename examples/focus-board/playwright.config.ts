import { defineConfig, devices } from "@playwright/test";

// By default E2E runs against the production build served by `vite preview`, so it tests what is deployed.
// - BASE_URL=<url> runs the same suite against a live deployment (production smoke test); no local server is started.
// - BROWSERS=all also runs Firefox and WebKit (install once with `npx playwright install firefox webkit`).
// Locally the installed Chrome is used; in CI set CI=1 to use Playwright's own Chromium
// (`npx playwright install --with-deps chromium`).
const live = process.env.BASE_URL;
const all = process.env.BROWSERS === "all";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: live ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome", use: { channel: process.env.CI ? undefined : "chrome" } },
    ...(all
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: live
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
