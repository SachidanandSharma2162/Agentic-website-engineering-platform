import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DeployRequest, DeployResult, DeploymentProvider, PreflightResult } from "./types.ts";

const PAGES_URL = /https:\/\/[a-z0-9][a-z0-9.-]*\.pages\.dev\b[^\s)'"]*/gi;
const MISSING_PROJECT = /Pages project "[^"]+" does not exist/i;
const VALID_NAME = /^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/;

/**
 * Cloudflare Pages via `wrangler pages deploy` (direct upload). Needs CLOUDFLARE_API_TOKEN
 * (scoped to Pages edit) and CLOUDFLARE_ACCOUNT_ID in the environment; both are redacted from logs.
 */
export class CloudflarePagesProvider implements DeploymentProvider {
  readonly id = "cloudflare-pages";
  readonly requiredEnv = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;

  scopeFor(projectName: string): string {
    return `${this.id}:${projectName}`;
  }

  async preflight(req: DeployRequest): Promise<PreflightResult> {
    const problems: string[] = [];
    if (!VALID_NAME.test(req.projectName)) {
      problems.push(`project name "${req.projectName}" must be 2-59 chars of lowercase letters, digits and hyphens`);
    }
    const dist = join(req.runner.root, req.distDir);
    if (!existsSync(dist) || !statSync(dist).isDirectory()) {
      problems.push(`build output directory not found: ${req.distDir} (run the production build first)`);
    } else if (!existsSync(join(dist, "index.html"))) {
      problems.push(`${req.distDir}/index.html is missing`);
    }
    if (!req.dryRun) {
      for (const name of this.requiredEnv) if (!process.env[name]) problems.push(`environment variable ${name} is not set`);
    }
    return { ok: problems.length === 0, problems };
  }

  async deploy(req: DeployRequest): Promise<DeployResult> {
    const pre = await this.preflight(req);
    if (!pre.ok) return { ok: false, log: "", error: `preflight failed: ${pre.problems.join("; ")}` };
    if (req.dryRun) {
      return {
        ok: true,
        log: `[dry-run] would run: npx wrangler pages deploy ${req.distDir} --project-name ${req.projectName} --branch ${req.branch}`,
      };
    }

    // The runner's policy requires this action to have been granted; the caller grants it only after
    // gates C and D (with this exact scope) are approved.
    const deployArgs = ["wrangler", "pages", "deploy", req.distDir, "--project-name", req.projectName, "--branch", req.branch];
    let r = await req.runner.run("npx", deployArgs, { timeoutMs: 10 * 60_000 });
    let log = `${r.stdout}\n${r.stderr}`.trim();

    // First deployment of a new site: the Pages project does not exist yet. Creating it is part of the approved scope
    // (Gates C and D name this exact project), so create it and retry once. Any other failure is reported as is.
    if (r.code !== 0 && MISSING_PROJECT.test(log)) {
      const created = await req.runner.run("npx", ["wrangler", "pages", "project", "create", req.projectName, "--production-branch", req.branch], { timeoutMs: 2 * 60_000 });
      const createLog = `${created.stdout}\n${created.stderr}`.trim();
      if (created.code !== 0) {
        return { ok: false, log: `${log}\n--- project create ---\n${createLog}`, error: `creating Pages project "${req.projectName}" failed (wrangler exit ${created.code})` };
      }
      r = await req.runner.run("npx", deployArgs, { timeoutMs: 10 * 60_000 });
      log = `${log}\n--- project create ---\n${createLog}\n--- deploy retry ---\n${r.stdout}\n${r.stderr}`.trim();
    }
    if (r.code !== 0) return { ok: false, log, error: `wrangler exited with code ${r.code}${r.timedOut ? " (timed out)" : ""}` };

    // Prefer the last pages.dev URL wrangler printed (deployment URL), from real output only.
    const urls = log.match(PAGES_URL);
    const url = urls?.at(-1)?.replace(/[.,;]+$/, "");
    return url ? { ok: true, url, log } : { ok: false, log, error: "wrangler succeeded but reported no pages.dev URL" };
  }

  rollbackGuidance(projectName: string): string {
    return [
      `Cloudflare Pages keeps every deployment. To roll back "${projectName}":`,
      "1. Open the Cloudflare dashboard > Workers & Pages > the project > Deployments.",
      "2. Find the last known-good production deployment and choose 'Rollback to this deployment'.",
      "3. Re-run the production smoke tests against the live URL.",
      "A failed or partial `wrangler pages deploy` does not replace the live production deployment until it completes.",
    ].join("\n");
  }
}
