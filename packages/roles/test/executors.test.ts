import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, StateStore, type Task } from "@sdlc/core";
import { CloudflarePagesProvider, type DeploymentProvider } from "@sdlc/providers";
import { classifyRequest, createExecutors, slugify, standardWebsiteTasks } from "../src/index.ts";

let dir: string;
let store: StateStore;
const PID = "demo";
const SCOPE = "cloudflare-pages:demo-site";

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-roles-")));
  store = new StateStore(":memory:");
  const now = new Date().toISOString();
  store.saveProject({
    id: PID, name: "Demo", request: "A habit tracker with streaks, and a weekly summary", category: "web application",
    complexity: "small", phase: "DISCOVERY", workDir: dir, approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const plan = (extra?: Parameters<typeof standardWebsiteTasks>[0]["qualityCommands"]) =>
  standardWebsiteTasks({
    projectId: PID, deployScope: SCOPE, deployProvider: "cloudflare-pages", deployProjectName: "demo-site",
    ...(extra ? { qualityCommands: extra } : {}),
  });

const get = (id: string): Task => store.getTask(PID, id)!;

describe("planner", () => {
  it("classifies requests", () => {
    expect(classifyRequest("my portfolio site").category).toBe("portfolio");
    expect(classifyRequest("an online shop with checkout and user accounts, admin roles").category).toBe("e-commerce");
    expect(classifyRequest("a tool").category).toBe("web application");
    expect(classifyRequest("a blog").complexity).toBe("small");
    expect(classifyRequest("SaaS dashboard with login, database, payments and admin roles").complexity).toBe("large");
    expect(slugify("Focus Board!!")).toBe("focus-board");
  });

  it("produces a valid DAG with gates attached where policy requires", () => {
    const orch = new Orchestrator({ store, executors: {} });
    expect(() => orch.addTasks(PID, plan())).not.toThrow();
    const byId = new Map(plan().map((t) => [t.id, t]));
    expect(byId.get("design")!.gates).toEqual(["A"]);
    expect(byId.get("implement")!.gates).toEqual(["A", "B"]);
    expect(byId.get("deploy")!.gates).toEqual(["C", "D"]);
    expect(byId.get("deploy")!.approvalScope).toBe(SCOPE);
  });
});

describe("lifecycle until the first approval gate", () => {
  it("drafts the spec without overwriting existing docs, then waits for the operator", async () => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "requirements.md"), "HAND-WRITTEN");
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, plan());
    const s = await orch.run(PID);
    expect(readFileSync(join(dir, "docs", "requirements.md"), "utf8")).toBe("HAND-WRITTEN");
    expect(readFileSync(join(dir, "docs", "user-stories.md"), "utf8")).toContain("DRAFT");
    expect(s.completed).toEqual(["spec"]);
    expect(s.waiting.map((w) => w.taskId)).toEqual(["architecture"]);
    expect(s.waiting[0]!.message).toContain("docs/architecture.md");
    expect(s.done).toBe(false);
  });

  it("completes the operator task once the artifact exists, then stops at Gate A", async () => {
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, plan());
    await orch.run(PID);
    writeFileSync(join(dir, "docs", "architecture.md"), "# Architecture");
    const s = await orch.run(PID);
    expect(get("architecture").status).toBe("COMPLETED");
    expect(s.needsApproval).toEqual([{ taskId: "design", gates: ["A"] }]);
  });
});

describe("run-checks", () => {
  it("passes real commands and writes evidence", async () => {
    writeFileSync(join(dir, "ok.js"), "console.log('fine')");
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, [{ ...plan()[0]!, id: "chk", action: "builtin.run-checks", artifacts: [], params: { commands: [{ name: "ok", cmd: "node", args: ["ok.js"] }] } }]);
    const s = await orch.run(PID);
    expect(s.done).toBe(true);
    const ev = JSON.parse(readFileSync(join(dir, "docs", "evidence", "chk.json"), "utf8"));
    expect(ev.results[0]).toMatchObject({ name: "ok", code: 0 });
    expect(ev.results[0].output).toContain("fine");
  });

  it("fails with the real output, retries, then BLOCKS after the budget", async () => {
    writeFileSync(join(dir, "bad.js"), "console.error('assertion: expected 2 got 1'); process.exit(1)");
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, [{ ...plan()[0]!, id: "chk", action: "builtin.run-checks", maxRetries: 2, artifacts: [], params: { commands: [{ name: "bad", cmd: "node", args: ["bad.js"] }] } }]);
    const s = await orch.run(PID);
    expect(get("chk")).toMatchObject({ status: "BLOCKED", retryCount: 3 });
    expect(get("chk").lastError).toContain("assertion: expected 2 got 1");
    expect(s.done).toBe(false);
  });

  it("blocks immediately when a command violates policy", async () => {
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, [{ ...plan()[0]!, id: "chk", action: "builtin.run-checks", artifacts: [], params: { commands: [{ name: "evil", cmd: "curl", args: ["http://x"] }] } }]);
    await orch.run(PID);
    expect(get("chk")).toMatchObject({ status: "BLOCKED", retryCount: 1 });
    expect(get("chk").lastError).toMatch(/allowlist/);
  });
});

/** Fast-forward a project to the point where only the deploy chain remains. */
function fastForwardToDeploy() {
  const orch = new Orchestrator({ store, executors: createExecutors({ providers: { "cloudflare-pages": new CloudflarePagesProvider() }, smokeRetryDelayMs: 1, fetchFn: fakeFetch }) });
  orch.addTasks(PID, plan());
  for (const t of ["spec", "architecture", "design", "implement", "tests", "quality", "security"]) store.updateTask(PID, t, { status: "COMPLETED" });
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>Demo Site</title>");
  return orch;
}
let fakeStatus = 200;
const fakeFetch = (async () => new Response("<title>Demo Site</title>", { status: fakeStatus })) as typeof fetch;

describe("release + deploy gating", () => {
  it("fails the release report when the build output is missing (no fake readiness)", async () => {
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(PID, plan());
    for (const t of ["spec", "architecture", "design", "implement", "tests", "quality", "security"]) store.updateTask(PID, t, { status: "COMPLETED" });
    store.recordApproval({ projectId: PID, gate: "B", decision: "approved", by: "u" });
    await orch.run(PID);
    expect(get("release")).toMatchObject({ status: "BLOCKED" });
    expect(get("release").lastError).toMatch(/build output/);
  });

  it("generates a release report from recorded state, then stops at Gate C/D", async () => {
    const orch = fastForwardToDeploy();
    store.recordApproval({ projectId: PID, gate: "B", decision: "approved", by: "u" });
    const s = await orch.run(PID);
    expect(get("release").status).toBe("COMPLETED");
    expect(readFileSync(join(dir, "docs", "release-report.md"), "utf8")).toContain("| deploy |");
    expect(s.needsApproval.find((n) => n.taskId === "deploy")?.gates).toEqual(["C", "D"]);
  });

  it("refuses to deploy to a scope other than the one approved", async () => {
    const orch = fastForwardToDeploy();
    store.recordApproval({ projectId: PID, gate: "B", decision: "approved", by: "u" });
    store.recordApproval({ projectId: PID, gate: "C", decision: "approved", by: "u", scope: "cloudflare-pages:other-site" });
    store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: "cloudflare-pages:other-site" });
    const s = await orch.run(PID);
    expect(get("deploy").status).toBe("NEEDS_APPROVAL");
    expect(s.completed).not.toContain("deploy");
  });

  it("with full scoped approval but no credentials, blocks naming the exact missing variables", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const orch = fastForwardToDeploy();
    for (const gate of ["B"] as const) store.recordApproval({ projectId: PID, gate, decision: "approved", by: "u" });
    for (const gate of ["C", "D"] as const) store.recordApproval({ projectId: PID, gate, decision: "approved", by: "u", scope: SCOPE });
    const s = await orch.run(PID);
    expect(get("deploy").status).toBe("BLOCKED");
    expect(get("deploy").lastError).toContain("CLOUDFLARE_API_TOKEN");
    expect(get("deploy").lastError).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(store.getProject(PID)!.deployments).toEqual([]);
    expect(s.unreachable).toContain("smoke");
  });

  it("dry-run mode never reports a deployment", async () => {
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: { "cloudflare-pages": new CloudflarePagesProvider() }, dryRun: true }) });
    orch.addTasks(PID, plan());
    for (const t of ["spec", "architecture", "design", "implement", "tests", "quality", "security", "release"]) store.updateTask(PID, t, { status: "COMPLETED" });
    store.recordApproval({ projectId: PID, gate: "C", decision: "approved", by: "u", scope: SCOPE });
    store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: SCOPE });
    await orch.run(PID);
    expect(get("deploy").status).toBe("BLOCKED");
    expect(get("deploy").lastError).toMatch(/dry-run/);
    expect(store.getProject(PID)!.deployments).toEqual([]);
  });
});

describe("deploy adapter with a stub provider, and smoke tests", () => {
  const stub: DeploymentProvider = {
    id: "cloudflare-pages",
    requiredEnv: [],
    scopeFor: (n) => `cloudflare-pages:${n}`,
    preflight: async () => ({ ok: true, problems: [] }),
    deploy: async () => ({ ok: true, url: "https://demo-site.pages.dev", log: "uploaded; token=abc123456789" }),
    rollbackGuidance: () => "",
  };

  async function deployAll() {
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: { "cloudflare-pages": stub }, smokeRetryDelayMs: 1, fetchFn: fakeFetch }) });
    orch.addTasks(PID, plan());
    for (const t of ["spec", "architecture", "design", "implement", "tests", "quality", "security", "release"]) store.updateTask(PID, t, { status: "COMPLETED" });
    store.recordApproval({ projectId: PID, gate: "C", decision: "approved", by: "u", scope: SCOPE });
    store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: SCOPE });
    return orch.run(PID);
  }

  it("records the provider-reported URL, verifies it, and redacts evidence", async () => {
    fakeStatus = 200;
    const s = await deployAll();
    expect(s.completed).toEqual(["deploy", "smoke"]);
    const dep = store.getProject(PID)!.deployments[0]!;
    expect(dep).toMatchObject({ url: "https://demo-site.pages.dev", verified: true, target: SCOPE });
    const evFiles = readdirSync(join(dir, "docs", "evidence"));
    const deployEv = readFileSync(join(dir, "docs", "evidence", evFiles.find((f) => f.startsWith("deploy-"))!), "utf8");
    expect(deployEv).not.toContain("abc123456789");
  });

  it("does not mark a deployment verified when the live site returns an error", async () => {
    fakeStatus = 503;
    await deployAll();
    expect(get("smoke").status).toBe("BLOCKED");
    expect(store.getProject(PID)!.deployments[0]!.verified).toBe(false);
    expect(get("smoke").lastError).toContain("503");
  });
});
