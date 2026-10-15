import { defineConfig } from "@playwright/test";

// By default E2E runs against the production build served by `vite preview`, so it tests what is deployed.
// Set BASE_URL to run the same suite against a live deployment (production smoke test); no local server is started then.
// Locally the installed Chrome is used; in CI run `npx playwright install --with-deps chromium` and set CI=1.
const live = process.env.BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: live ?? "http://127.0.0.1:4173",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: live
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
