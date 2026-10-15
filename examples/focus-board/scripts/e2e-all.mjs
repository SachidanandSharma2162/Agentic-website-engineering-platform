// Runs the Playwright suite in Chrome, Firefox and WebKit. A tiny wrapper because `BROWSERS=all cmd` is not portable
// across Windows and POSIX shells inside npm scripts.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BROWSERS: "all" },
});
process.exit(r.status ?? 1);
