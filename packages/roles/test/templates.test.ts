import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, StateStore, type Project } from "@sdlc/core";
import { MODULES, TEMPLATES, classifyRequest, createExecutors, draftSpecFiles, selectModules, standardWebsiteTasks, templateFor } from "../src/index.ts";

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-tpl-")));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function projectFor(request: string, name = "Demo"): Project {
  const c = classifyRequest(request);
  const now = new Date().toISOString();
  return { id: "demo", name, request, category: c.category, complexity: c.complexity, phase: "DISCOVERY", workDir: dir, approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now };
}
const file = (p: Project, path: string) => draftSpecFiles(p).find((f) => f.path === path)!.content;

describe("template registry integrity", () => {
  it("has a template for every category the classifier can return", () => {
    for (const category of ["e-commerce", "marketplace", "booking system", "saas dashboard", "internal tool", "blog", "portfolio", "landing page", "web application"]) {
      expect(TEMPLATES[category], category).toBeDefined();
      expect(templateFor(category).category).toBe(category);
    }
    expect(templateFor("something unknown").category).toBe("web application");
  });

  it("only references modules that exist, and every module has verifiable acceptance criteria", () => {
    for (const t of Object.values(TEMPLATES)) {
      for (const id of [...t.mvp, ...t.optional, ...t.future]) expect(MODULES[id], `${t.category} -> ${id}`).toBeDefined();
      expect(t.journeys.length, t.category).toBeGreaterThan(0);
      expect(t.risks.length, t.category).toBeGreaterThan(0);
    }
    for (const x of Object.values(MODULES)) expect(x.acceptance.length, x.id).toBeGreaterThan(0);
  });

  it("flags every module that spends money, messages people, stores uploads or publishes user content as a Gate E action", () => {
    for (const x of Object.values(MODULES)) {
      if (x.requires.some((c) => c === "payments" || c === "email" || c === "uploads")) {
        expect(x.gateE, `${x.id} needs a Gate E reason`).toBeTruthy();
      }
    }
  });

  it("does not let two categories share an identical MVP set, so templates are not interchangeable", () => {
    const sets = Object.values(TEMPLATES).map((t) => [...t.mvp].sort().join("|"));
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe("module selection from the request text", () => {
  it("promotes a future-scope module the request explicitly asks for, and surfaces its Gate E and capabilities", () => {
    const request = "an online shop with a product catalog, cart and stripe checkout";
    const c = classifyRequest(request);
    expect(c.category).toBe("e-commerce");
    const sel = selectModules(request, templateFor(c.category));
    expect(sel.requested.map((x) => x.id)).toContain("checkout-payments");
    expect(sel.future.map((x) => x.id)).not.toContain("checkout-payments");
    expect(sel.capabilities).toEqual(expect.arrayContaining(["backend", "payments"]));
    expect(sel.gateE.map((g) => g.module)).toContain("checkout-payments");
  });

  it("detects reminder emails in a booking request and treats them as a Gate E action", () => {
    const request = "appointment booking for a dental clinic with patient accounts and reminder emails";
    const sel = selectModules(request, templateFor(classifyRequest(request).category));
    expect(sel.requested.map((x) => x.id)).toContain("email-notifications");
    expect(sel.capabilities).toContain("email");
    expect(sel.gateE.map((g) => g.module)).toContain("email-notifications");
  });

  it("does not invent modules the request never mentions", () => {
    const sel = selectModules("a pomodoro timer", templateFor("web application"));
    expect(sel.requested).toEqual([]);
    expect(sel.gateE).toEqual([]);
    expect(sel.capabilities).toEqual([]);
  });
});

describe("generalisation: different requests produce different, category-appropriate plans", () => {
  const matrix: [string, string][] = [
    ["a portfolio to showcase my design projects with a contact form", "portfolio"],
    ["a landing page for our app with a waitlist signup", "landing page"],
    ["a blog about cooking with articles and search", "blog"],
    ["an online shop with a product catalog, cart and stripe checkout", "e-commerce"],
    ["a marketplace where sellers list items and buyers contact them", "marketplace"],
    ["appointment booking for a dental clinic", "booking system"],
    ["a saas analytics dashboard with login", "saas dashboard"],
    ["an internal tool for the helpdesk team to track tickets", "internal tool"],
    ["a pomodoro timer", "web application"],
  ];

  it.each(matrix)("%s -> %s", (request, category) => {
    expect(classifyRequest(request).category).toBe(category);
    const p = projectFor(request);
    for (const f of draftSpecFiles(p)) {
      expect(f.content.length, f.path).toBeGreaterThan(100);
      expect(f.content, f.path).toContain("DRAFT");
    }
  });

  it("produces materially different requirements, criteria and risks per category", () => {
    const portfolio = projectFor("a portfolio to showcase my design projects with a contact form");
    const booking = projectFor("appointment booking for a dental clinic");
    const shop = projectFor("an online shop with a product catalog, cart and stripe checkout");

    expect(file(portfolio, "docs/requirements.md")).toContain("Project gallery");
    expect(file(booking, "docs/requirements.md")).toContain("Booking calendar");
    expect(file(shop, "docs/requirements.md")).toContain("Product catalog");
    expect(file(portfolio, "docs/requirements.md")).not.toContain("Booking calendar");

    expect(file(booking, "docs/acceptance-criteria.md")).toMatch(/cannot be booked twice/);
    expect(file(booking, "docs/risk-register.md")).toMatch(/Double bookings/);
    expect(file(shop, "docs/risk-register.md")).toMatch(/Money handling/);
    expect(file(shop, "docs/acceptance-criteria.md")).toMatch(/Card data never touches/);
    expect(file(portfolio, "docs/risk-register.md")).not.toMatch(/Double bookings|Money handling/);
  });

  it("calls out Gate E up front for modules that email people or take payments", () => {
    const shop = file(projectFor("an online shop with a product catalog, cart and stripe checkout"), "docs/requirements.md");
    expect(shop).toMatch(/Gate E[\s\S]*checkout-payments/);
    const portfolio = file(projectFor("a portfolio with a contact form"), "docs/requirements.md");
    expect(portfolio).toMatch(/Gate E[\s\S]*contact-form/);
    const timer = file(projectFor("a pomodoro timer"), "docs/requirements.md");
    expect(timer).toContain("none identified");
  });

  it("every drafted design brief names the category priority and demands contrast checks", () => {
    const brief = file(projectFor("an online shop with a product catalog"), "docs/design-brief.draft.md");
    expect(brief).toContain("Product discovery, clear pricing");
    expect(brief).toMatch(/contrast/i);
  });
});

describe("drafts never satisfy operator tasks", () => {
  it("architecture and design drafts use .draft names, so the tasks keep waiting for reviewed work", async () => {
    const p = projectFor("a portfolio with a contact form");
    const names = draftSpecFiles(p).map((f) => f.path);
    expect(names).toContain("docs/architecture.draft.md");
    expect(names).toContain("docs/design-brief.draft.md");
    expect(names).not.toContain("docs/architecture.md");

    const store = new StateStore(":memory:");
    store.saveProject(p);
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(p.id, standardWebsiteTasks({ projectId: p.id, deployScope: "cloudflare-pages:demo", deployProvider: "cloudflare-pages", deployProjectName: "demo" }));
    const s = await orch.run(p.id);
    expect(existsSync(join(dir, "docs", "architecture.draft.md"))).toBe(true);
    expect(existsSync(join(dir, "docs", "architecture.md"))).toBe(false);
    expect(s.waiting.map((w) => w.taskId)).toEqual(["architecture"]);
  });
});

describe("planner: backend task", () => {
  const base = { projectId: "demo", deployScope: "cloudflare-pages:demo", deployProvider: "cloudflare-pages", deployProjectName: "demo" };

  it("adds a gated backend task that must finish before tests, and keeps the DAG valid", () => {
    const tasks = standardWebsiteTasks({ ...base, backend: true });
    const backend = tasks.find((t) => t.id === "backend")!;
    expect(backend).toMatchObject({ role: "backend", dependsOn: ["design"], gates: ["A", "B"] });
    expect(tasks.find((t) => t.id === "tests")!.dependsOn).toEqual(["implement", "backend"]);
    const store = new StateStore(":memory:");
    store.saveProject(projectFor("x"));
    expect(() => new Orchestrator({ store, executors: {} }).addTasks("demo", tasks)).not.toThrow();
  });

  it("is absent by default, leaving the original graph unchanged", () => {
    const tasks = standardWebsiteTasks(base);
    expect(tasks.some((t) => t.id === "backend")).toBe(false);
    expect(tasks.find((t) => t.id === "tests")!.dependsOn).toEqual(["implement"]);
  });

  it("the backend task waits for its artifact like any operator task", async () => {
    const p = projectFor("appointment booking for a dental clinic");
    const store = new StateStore(":memory:");
    store.saveProject(p);
    const orch = new Orchestrator({ store, executors: createExecutors({ providers: {} }) });
    orch.addTasks(p.id, standardWebsiteTasks({ ...base, projectId: p.id, backend: true }));
    for (const t of ["spec", "architecture", "design"]) store.updateTask(p.id, t, { status: "COMPLETED" });
    store.recordApproval({ projectId: p.id, gate: "A", decision: "approved", by: "u" });
    store.recordApproval({ projectId: p.id, gate: "B", decision: "approved", by: "u" });
    const s = await orch.run(p.id);
    expect(s.waiting.map((w) => w.taskId).sort()).toEqual(["backend", "implement"]);
  });
});
