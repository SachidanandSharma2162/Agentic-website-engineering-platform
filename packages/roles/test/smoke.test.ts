import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, StateStore } from "@sdlc/core";
import type { DeploymentProvider } from "@sdlc/providers";
import { createExecutors, standardWebsiteTasks, type SmokeSpec } from "../src/index.ts";

const PID = "demo";
const SCOPE = "cloudflare-pages:demo-site";
let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-smoke-")));
  store = new StateStore(":memory:");
  const now = new Date().toISOString();
  store.saveProject({ id: PID, name: "Demo", request: "r", category: "web application", complexity: "small", phase: "DISCOVERY", workDir: dir, approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const stub: DeploymentProvider = {
  id: "cloudflare-pages",
  requiredEnv: [],
  scopeFor: (n) => `cloudflare-pages:${n}`,
  preflight: async () => ({ ok: true, problems: [] }),
  deploy: async () => ({ ok: true, url: "https://demo-site.pages.dev", log: "ok" }),
  rollbackGuidance: () => "",
};

type Page = { status?: number; body?: string; headers?: Record<string, string> };

async function runSmoke(smoke: SmokeSpec | undefined, pages: Record<string, Page>) {
  const fetchFn = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const p = pages[path] ?? { status: 404, body: "not found" };
    return new Response(p.body ?? "", { status: p.status ?? 200, headers: p.headers });
  }) as typeof fetch;
  const orch = new Orchestrator({ store, executors: createExecutors({ providers: { "cloudflare-pages": stub }, smokeRetryDelayMs: 1, fetchFn }) });
  orch.addTasks(PID, standardWebsiteTasks({ projectId: PID, deployScope: SCOPE, deployProvider: "cloudflare-pages", deployProjectName: "demo-site", ...(smoke ? { smoke } : {}) }));
  for (const t of ["spec", "architecture", "design", "implement", "tests", "quality", "security", "release"]) store.updateTask(PID, t, { status: "COMPLETED" });
  store.recordApproval({ projectId: PID, gate: "C", decision: "approved", by: "u", scope: SCOPE });
  store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: SCOPE });
  await orch.run(PID);
  return { smoke: store.getTask(PID, "smoke")!, verified: store.getProject(PID)!.deployments[0]?.verified };
}

const csp = { "content-security-policy": "default-src 'self'" };

describe("smoke test: per-route checks and required headers", () => {
  const spec: SmokeSpec = {
    checks: [{ path: "/", contains: "Focus" }, { path: "/habits", contains: "Focus" }, { path: "/gone", status: 404 }],
    requireHeaders: ["Content-Security-Policy"],
  };
  const good: Record<string, Page> = {
    "/": { body: "<title>Focus Board</title>", headers: csp },
    "/habits": { body: "<title>Focus Board</title>" },
    "/gone": { status: 404, body: "nope" },
  };

  it("passes only when every route, status, content and header expectation holds, then marks the deployment verified", async () => {
    const r = await runSmoke(spec, good);
    expect(r.smoke.status).toBe("COMPLETED");
    expect(r.verified).toBe(true);
  });

  it("fails when a required security header is missing", async () => {
    const r = await runSmoke(spec, { ...good, "/": { body: "<title>Focus Board</title>" } });
    expect(r.smoke.status).toBe("BLOCKED");
    expect(r.smoke.lastError).toMatch(/missing headers: content-security-policy/);
    expect(r.verified).toBe(false);
  });

  it("fails when a deep route returns the wrong content", async () => {
    const r = await runSmoke(spec, { ...good, "/habits": { body: "Application error" } });
    expect(r.smoke.status).toBe("BLOCKED");
    expect(r.smoke.lastError).toMatch(/\/habits[\s\S]*body missing "Focus"/);
  });

  it("fails when a route expected to be a 404 is served as 200", async () => {
    const r = await runSmoke(spec, { ...good, "/gone": { status: 200, body: "app shell" } });
    expect(r.smoke.status).toBe("BLOCKED");
    expect(r.smoke.lastError).toMatch(/\/gone[\s\S]*expected status 404/);
  });

  it("the default (no smoke spec) still just checks that / returns 200", async () => {
    const r = await runSmoke(undefined, { "/": { body: "anything" } });
    expect(r.smoke.status).toBe("COMPLETED");
  });
});
