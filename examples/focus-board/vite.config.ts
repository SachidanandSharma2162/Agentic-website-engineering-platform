/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Day arithmetic is tested across DST changes, so the suite must run in a timezone that has them.
process.env.TZ = "America/New_York";

/**
 * Headers for the catch-all rule of public/_headers (the file Cloudflare Pages applies). `vite preview` serves the same
 * headers, so local E2E runs under the real Content-Security-Policy instead of only discovering violations after deploying.
 */
function catchAllHeaders(file: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let inCatchAll = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\S/.test(line)) inCatchAll = line.trim() === "/*";
    else if (inCatchAll && line.includes(":")) {
      const i = line.indexOf(":");
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return headers;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false, target: "es2022" },
  preview: { headers: catchAllHeaders("public/_headers") },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: false,
  },
});
