import { Task } from "@sdlc/core";

export interface Classification {
  category: string;
  complexity: "small" | "medium" | "large";
  signals: string[];
}

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["e-commerce", /\b(shop|store|e-?commerce|cart|checkout|product catalog)\b/i],
  ["marketplace", /\b(marketplace|sellers?\s+and\s+buyers?|listings?)\b/i],
  ["booking system", /\b(booking|reservation|appointment|schedul(e|ing))\b/i],
  ["saas dashboard", /\b(saas|dashboard|analytics|admin panel|metrics)\b/i],
  ["internal tool", /\b(internal tool|back-?office|crm|inventory|helpdesk)\b/i],
  ["blog", /\b(blog|articles?|newsletter|cms)\b/i],
  ["portfolio", /\b(portfolio|resume|cv|personal site|showcase)\b/i],
  ["landing page", /\b(landing page|waitlist|marketing site|product page)\b/i],
];

const COMPLEXITY_SIGNALS: [string, RegExp][] = [
  ["authentication", /\b(auth(entication)?|login|sign[- ]?(in|up)|accounts?|users?)\b/i],
  ["database", /\b(database|persist|sync|backend|server|api)\b/i],
  ["payments", /\b(payments?|stripe|checkout|billing|subscriptions?)\b/i],
  ["multi-user", /\b(multi-?user|roles?|permissions?|admin|collaborat\w+|real-?time)\b/i],
  ["integrations", /\b(integrat\w+|webhooks?|email|sms|third-party)\b/i],
];

/** Heuristic classification: a starting point for the Gate A plan, always reviewed by the operator. */
export function classifyRequest(request: string): Classification {
  const category = CATEGORY_KEYWORDS.find(([, re]) => re.test(request))?.[0] ?? "web application";
  const signals = COMPLEXITY_SIGNALS.filter(([, re]) => re.test(request)).map(([name]) => name);
  const complexity = signals.length >= 4 ? "large" : signals.length >= 2 ? "medium" : "small";
  return { category, complexity, signals };
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 40) || "project";
}

export interface PlanOptions {
  projectId: string;
  /** Provider approval scope for the deploy task, e.g. "cloudflare-pages:focus-board". */
  deployScope: string;
  deployProvider: string;
  deployProjectName: string;
  distDir?: string;
  /** Commands the quality task runs. Each runs inside the project directory. */
  qualityCommands?: { name: string; cmd: string; args: string[] }[];
  /** Files each operator-authored task must produce before it can complete. */
  expect?: Partial<Record<"architecture" | "design" | "implement" | "backend" | "tests" | "handover", string[]>>;
  /** Add a backend task (API, data layer, server-side authorization) that must finish before tests run. */
  backend?: boolean;
  /** What the production smoke test checks on the live URL. Defaults to fetching "/" for HTTP 200. */
  smoke?: SmokeSpec;
}

export interface SmokeCheck {
  path: string;
  /** Expected HTTP status (default 200). */
  status?: number;
  /** Text the response body must contain. */
  contains?: string;
}

export interface SmokeSpec {
  checks?: SmokeCheck[];
  /** Response headers that must be present on "/" (e.g. content-security-policy). Case-insensitive. */
  requireHeaders?: string[];
}

const DEFAULT_QUALITY = [
  { name: "type-check", cmd: "npm", args: ["run", "typecheck"] },
  { name: "lint", cmd: "npm", args: ["run", "lint"] },
  { name: "unit-tests", cmd: "npm", args: ["test"] },
  { name: "production-build", cmd: "npm", args: ["run", "build"] },
];

/** The standard website lifecycle as a task DAG. Gates are attached where the HITL policy demands them. */
export function standardWebsiteTasks(o: PlanOptions): Task[] {
  const t = (x: Partial<Task> & Pick<Task, "id" | "title" | "phase" | "role" | "action">): Task =>
    Task.parse({ projectId: o.projectId, ...x });
  const expect = o.expect ?? {};
  return [
    t({
      id: "spec", title: "Generate draft requirements, stories, acceptance criteria, plan and risk register",
      phase: "SPECIFICATION", role: "product", action: "builtin.generate-spec",
      artifacts: ["docs/requirements.md", "docs/user-stories.md", "docs/acceptance-criteria.md", "docs/project-plan.md", "docs/risk-register.md"],
    }),
    t({
      id: "architecture", title: "Architecture and technology decisions", phase: "ARCHITECTURE", role: "architect",
      action: "builtin.operator", dependsOn: ["spec"],
      params: { instructions: "Write docs/architecture.md and decision records in docs/decisions/.", expect: expect.architecture ?? ["docs/architecture.md"] },
    }),
    t({
      id: "design", title: "Sitemap, design system and runnable prototype", phase: "UI_UX", role: "designer",
      action: "builtin.operator", dependsOn: ["architecture"], gates: ["A"],
      params: { instructions: "Produce sitemap, design system and a runnable prototype for review at Gate B.", expect: expect.design ?? ["docs/sitemap.md", "docs/design-system.md", "prototype/index.html"] },
    }),
    t({
      id: "implement", title: "Implement the approved design", phase: "IMPLEMENTATION", role: "frontend",
      action: "builtin.operator", dependsOn: ["design"], gates: ["A", "B"], checkpoint: true,
      params: { instructions: "Implement the application per the approved plan and design.", expect: expect.implement ?? ["package.json", "src/main.tsx"] },
    }),
    ...(o.backend
      ? [
          t({
            id: "backend", title: "Implement API, data layer and server-side authorization", phase: "IMPLEMENTATION", role: "backend",
            action: "builtin.operator", dependsOn: ["design"], gates: ["A", "B"], checkpoint: true,
            params: { instructions: "Implement the API, validation, authorization on every protected operation, migrations and seed data; document it.", expect: expect.backend ?? ["docs/api.md"] },
          }),
        ]
      : []),
    t({
      id: "tests", title: "Write automated tests from the acceptance criteria", phase: "TESTING", role: "qa",
      action: "builtin.operator", dependsOn: o.backend ? ["implement", "backend"] : ["implement"], gates: ["B"],
      params: { instructions: "Write unit and end-to-end tests covering every acceptance criterion.", expect: expect.tests ?? ["tests"] },
    }),
    t({
      id: "quality", title: "Run quality gates (type-check, lint, tests, build)", phase: "TESTING", role: "qa",
      action: "builtin.run-checks", dependsOn: ["tests"], gates: ["B"],
      params: { commands: o.qualityCommands ?? DEFAULT_QUALITY },
    }),
    t({
      id: "security", title: "Dependency audit", phase: "TESTING", role: "security",
      action: "builtin.run-checks", dependsOn: ["implement"], gates: ["B"],
      params: { commands: [{ name: "npm-audit-high", cmd: "npm", args: ["audit", "--audit-level=high"] }] },
    }),
    t({
      id: "release", title: "Release readiness report", phase: "RELEASE_READINESS", role: "orchestrator",
      action: "builtin.release-report", dependsOn: ["quality", "security"], gates: ["B"],
      artifacts: ["docs/release-report.md"],
      params: { distDir: o.distDir ?? "dist", deployScope: o.deployScope },
    }),
    t({
      id: "deploy", title: `Deploy to ${o.deployScope}`, phase: "DEPLOYMENT", role: "devops",
      action: "builtin.deploy", dependsOn: ["release"], gates: ["C", "D"], approvalScope: o.deployScope, checkpoint: true,
      params: { provider: o.deployProvider, projectName: o.deployProjectName, distDir: o.distDir ?? "dist", branch: "main" },
    }),
    t({
      id: "smoke", title: "Production smoke tests", phase: "DEPLOYMENT", role: "qa",
      action: "builtin.smoke-test", dependsOn: ["deploy"], gates: ["D"], approvalScope: o.deployScope,
      params: o.smoke ? { checks: o.smoke.checks ?? [{ path: "/" }], requireHeaders: o.smoke.requireHeaders ?? [] } : { paths: ["/"] },
    }),
    t({
      id: "handover", title: "Handover documentation and final report", phase: "HANDOVER", role: "docs",
      action: "builtin.operator", dependsOn: ["smoke"],
      params: { instructions: "Write README, deployment/rollback notes and the final report.", expect: expect.handover ?? ["README.md"] },
    }),
  ];
}
