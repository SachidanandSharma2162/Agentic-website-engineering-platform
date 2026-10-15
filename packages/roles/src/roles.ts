import type { RoleId } from "@sdlc/core";

export interface RoleDefinition {
  id: RoleId;
  title: string;
  responsibilities: string[];
  /** Artifacts this role is expected to produce. */
  outputs: string[];
  /** Tool classes the role may use; the command runner enforces the actual policy. */
  tools: string[];
}

/**
 * Roles are modular responsibilities executed sequentially by the orchestrator. They are not
 * independent concurrent agents: each task names the role it is performed in, and the work is
 * done by a built-in executor or by the operator (a human or an LLM session) for authoring tasks.
 */
export const ROLES: Record<RoleId, RoleDefinition> = {
  orchestrator: {
    id: "orchestrator",
    title: "Orchestrator",
    responsibilities: ["classify the request", "plan tasks and dependencies", "enforce gates", "track retries and blockers"],
    outputs: ["task graph", "execution history", "release report"],
    tools: ["state store"],
  },
  product: {
    id: "product",
    title: "Product and Requirements",
    responsibilities: ["structure requirements", "define user journeys", "write acceptance criteria", "flag conflicts and gaps"],
    outputs: ["docs/requirements.md", "docs/user-stories.md", "docs/acceptance-criteria.md", "docs/project-plan.md", "docs/risk-register.md"],
    tools: ["file write"],
  },
  architect: {
    id: "architect",
    title: "Architecture",
    responsibilities: ["choose the simplest sufficient architecture", "design data and API boundaries", "record decisions"],
    outputs: ["docs/architecture.md", "docs/decisions/*"],
    tools: ["file write"],
  },
  designer: {
    id: "designer",
    title: "UI/UX Design",
    responsibilities: ["visual concept", "sitemap and design system", "runnable prototype", "accessibility review"],
    outputs: ["docs/sitemap.md", "docs/design-system.md", "prototype/"],
    tools: ["file write", "browser"],
  },
  frontend: {
    id: "frontend",
    title: "Frontend Development",
    responsibilities: ["implement pages and components", "state, forms and error states", "responsive behaviour"],
    outputs: ["src/"],
    tools: ["file write", "npm"],
  },
  backend: {
    id: "backend",
    title: "Backend Development",
    responsibilities: ["API and business logic", "server-side validation and authorization", "migrations"],
    outputs: ["server/", "migrations/"],
    tools: ["file write", "npm"],
  },
  qa: {
    id: "qa",
    title: "QA and Test Automation",
    responsibilities: ["turn acceptance criteria into tests", "unit/integration/E2E", "regression after fixes", "smoke tests"],
    outputs: ["tests/", "docs/evidence/*"],
    tools: ["file write", "npm", "playwright"],
  },
  security: {
    id: "security",
    title: "Security",
    responsibilities: ["dependency audit", "review validation, secrets, headers", "block release on unresolved critical issues"],
    outputs: ["docs/security.md", "docs/evidence/audit*"],
    tools: ["npm audit"],
  },
  devops: {
    id: "devops",
    title: "DevOps and Deployment",
    responsibilities: ["deployment config", "deploy to the approved target", "rollback documentation"],
    outputs: ["docs/deployment.md", "deployment record"],
    tools: ["wrangler (approval-gated)"],
  },
  docs: {
    id: "docs",
    title: "Documentation and Observability",
    responsibilities: ["README and handover docs", "final report", "evidence index"],
    outputs: ["README.md", "docs/final-report.md"],
    tools: ["file write"],
  },
};
