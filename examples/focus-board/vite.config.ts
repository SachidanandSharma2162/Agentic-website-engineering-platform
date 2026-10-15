/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Day arithmetic is tested across DST changes, so the suite must run in a timezone that has them.
process.env.TZ = "America/New_York";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false, target: "es2022" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: false,
  },
});
