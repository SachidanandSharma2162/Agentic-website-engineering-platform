/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Time logic is tested in an explicit zone per test; this default only matters for code that forgets to pass one.
process.env.TZ = "America/New_York";

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, target: "es2022" },
  // `npm run dev` proxies the API to `npm run dev:api` (a Node server running the same handlers against SQLite).
  server: { proxy: { "/api": "http://127.0.0.1:8788" } },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/api/**/*.test.ts"],
    css: false,
  },
});
