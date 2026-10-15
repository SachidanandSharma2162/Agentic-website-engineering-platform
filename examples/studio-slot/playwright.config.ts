import { defineConfig, devices } from "@playwright/test";

// By default E2E runs against the production build served by the dev server (`node server/dev-server.ts`): the real API
// handler on real SQLite, plus the built site with the production security headers.
// - BASE_URL=<url> runs the same suite against a live deployment (set E2E_ADMIN_PASSPHRASE for the owner tests).
// - BROWSERS=all also runs Firefox and WebKit (install once with `npx playwright install firefox webkit`).
// Locally the installed Chrome is used; in CI set CI=1 to use Playwright's own Chromium.
const live = process.env.BASE_URL;
const all = process.env.BROWSERS === "all";
const PORT = 8789;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Three browsers at once overload a typical machine and cause timeouts that are not real failures.
  workers: all ? 3 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: { baseURL: live ?? `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
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
        command: "node server/dev-server.ts",
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          PORT: String(PORT),
          DB_PATH: ":memory:",
          ADMIN_PASSPHRASE: "e2e-passphrase",
          SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
          // Generous limits: many tests share one client address. The limits themselves are tested at the API level.
          RATE_LIMIT_BOOK: "100000",
          RATE_LIMIT_CANCEL: "100000",
          RATE_LIMIT_LOGIN: "100000",
        },
      },
});
