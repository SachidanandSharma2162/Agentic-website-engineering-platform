import { defineConfig } from "vitest/config";

// Platform tests only. Example sites are standalone projects with their own test setup.
export default defineConfig({
  test: { include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"] },
});
