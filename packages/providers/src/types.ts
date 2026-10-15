import type { CommandRunner } from "@sdlc/tools";

export interface DeployRequest {
  /** Provider-specific project name, e.g. the Cloudflare Pages project. */
  projectName: string;
  /** Build output directory, relative to the runner's project root. */
  distDir: string;
  /** Branch to publish to. "main" = production deployment on Cloudflare Pages. */
  branch: string;
  runner: CommandRunner;
  /** Report what would happen without contacting the provider. */
  dryRun?: boolean;
}

export interface PreflightResult {
  ok: boolean;
  /** Human-readable problems, each naming the exact missing item. Never contains secret values. */
  problems: string[];
}

export interface DeployResult {
  ok: boolean;
  /** URL parsed from the provider's own output; undefined if none was reported. */
  url?: string;
  /** Redacted provider output, kept for the evidence trail. */
  log: string;
  error?: string;
}

export interface DeploymentProvider {
  readonly id: string;
  /** Scope string used in Gate C/D approvals: `${id}:${projectName}`. */
  scopeFor(projectName: string): string;
  /** Environment variable names that must be present for a real deployment. */
  readonly requiredEnv: readonly string[];
  preflight(req: DeployRequest): Promise<PreflightResult>;
  deploy(req: DeployRequest): Promise<DeployResult>;
  rollbackGuidance(projectName: string): string;
}
