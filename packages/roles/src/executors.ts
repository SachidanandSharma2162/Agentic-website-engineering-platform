import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { checkGates, currentApproval, type Executor, type Project, type TaskContext, type TaskResult } from "@sdlc/core";
import type { DeploymentProvider } from "@sdlc/providers";
import { CommandRunner, PolicyError, redact } from "@sdlc/tools";
import { writeDraftSpec } from "./spec.ts";

export interface ExecutorDeps {
  providers: Record<string, DeploymentProvider>;
  /** Never contact a provider; deploy tasks then block with a clear message. */
  dryRun?: boolean;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  /** Delay between smoke-test retries (propagation time after a deploy). */
  smokeRetryDelayMs?: number;
}

interface CheckCommand {
  name: string;
  cmd: string;
  args: string[];
}

const ANSI = /\u001b\[[0-9;]*m/g;
const tail = (s: string, n = 3000) => {
  const clean = s.replace(ANSI, "");
  return clean.length > n ? "…" + clean.slice(-n) : clean;
};

function writeEvidence(project: Project, name: string, data: unknown): string {
  const rel = `docs/evidence/${name}.json`;
  const abs = join(project.workDir, rel);
  mkdirSync(join(project.workDir, "docs", "evidence"), { recursive: true });
  writeFileSync(abs, JSON.stringify(data, null, 2), "utf8");
  return rel;
}

function nonEmptyFile(abs: string): boolean {
  if (!existsSync(abs)) return false;
  const s = statSync(abs);
  if (s.isDirectory()) return readdirSync(abs).length > 0;
  return s.size > 0;
}

export function createExecutors(deps: ExecutorDeps): Record<string, Executor> {
  return {
    /** Draft spec docs from the request. Existing files are never overwritten. */
    "builtin.generate-spec": async ({ project, log }): Promise<TaskResult> => {
      const { written, skipped } = writeDraftSpec(project);
      log("spec drafted", { written, skipped });
      return { ok: true, message: `wrote ${written.length}, kept ${skipped.length} existing`, artifacts: [...written, ...skipped] };
    },

    /**
     * Authoring work performed by the operator (human or LLM session). The task completes only when
     * the expected artifacts exist and any verification commands pass; otherwise it reports "waiting".
     */
    "builtin.operator": async ({ project, task }): Promise<TaskResult> => {
      const expect = (task.params.expect as string[] | undefined) ?? [];
      const missing = expect.filter((p) => !nonEmptyFile(join(project.workDir, p)));
      if (missing.length > 0) {
        return {
          ok: false,
          waiting: true,
          message: `${String(task.params.instructions ?? "operator work required")} Missing: ${missing.join(", ")}`,
        };
      }
      return { ok: true, artifacts: expect, message: "operator artifacts present" };
    },

    /** Run commands, record redacted evidence, fail with the actual output if any command fails. */
    "builtin.run-checks": async ({ project, task, signal, log }): Promise<TaskResult> => {
      const commands = (task.params.commands as CheckCommand[] | undefined) ?? [];
      if (commands.length === 0) return { ok: false, retryable: false, error: "no commands configured" };
      const runner = new CommandRunner({ projectRoot: project.workDir });
      // The latest result is kept under the task id; every attempt also gets its own timestamped file, so failed runs stay on
      // record after a repair and are never overwritten (reopening a task resets the attempt counter, so the counter alone is not unique).
      const record = (payload: unknown): string[] => [
        writeEvidence(project, task.id, payload),
        writeEvidence(project, `${task.id}.${new Date().toISOString().replace(/[:.]/g, "-")}.attempt-${task.retryCount + 1}`, payload),
      ];
      const results: { name: string; command: string; code: number | null; durationMs: number; timedOut: boolean; output: string }[] = [];
      for (const c of commands) {
        if (signal.aborted) return { ok: false, error: "aborted" };
        try {
          const r = await runner.run(c.cmd, c.args, { timeoutMs: Math.max(1000, task.timeoutMs - 5000) });
          results.push({ name: c.name, command: r.command, code: r.code, durationMs: r.durationMs, timedOut: r.timedOut, output: tail(`${r.stdout}\n${r.stderr}`.trim()) });
          log(`${c.name}: exit ${r.code}`, { durationMs: r.durationMs });
        } catch (e) {
          const msg = e instanceof PolicyError ? `policy: ${e.message}` : e instanceof Error ? e.message : String(e);
          results.push({ name: c.name, command: `${c.cmd} ${c.args.join(" ")}`, code: null, durationMs: 0, timedOut: false, output: msg });
          if (e instanceof PolicyError) {
            return { ok: false, retryable: false, error: msg, artifacts: record({ task: task.id, attempt: task.retryCount + 1, at: new Date().toISOString(), results }) };
          }
        }
      }
      const evidence = record({ task: task.id, attempt: task.retryCount + 1, at: new Date().toISOString(), results });
      const failed = results.filter((r) => r.code !== 0);
      if (failed.length === 0) return { ok: true, artifacts: evidence, message: `${results.length} checks passed` };
      return {
        ok: false,
        artifacts: evidence,
        error: failed.map((f) => `${f.name} (exit ${f.code}${f.timedOut ? ", timed out" : ""}):\n${f.output}`).join("\n---\n"),
      };
    },

    /** Compile a release report from recorded state only; fails if the build output is missing. */
    "builtin.release-report": async ({ project, task, store }): Promise<TaskResult> => {
      const dist = String(task.params.distDir ?? "dist");
      if (!nonEmptyFile(join(project.workDir, dist))) {
        return { ok: false, retryable: false, error: `build output "${dist}" is missing or empty; run the production build` };
      }
      const tasks = store.listTasks(project.id);
      const approvals = store.listApprovals(project.id);
      const evidenceDir = join(project.workDir, "docs", "evidence");
      const evidence = existsSync(evidenceDir) ? readdirSync(evidenceDir).sort() : [];
      const lines = [
        `# Release report: ${project.name}`,
        "",
        `Generated ${new Date().toISOString()} from recorded platform state.`,
        "",
        "## Task status",
        "",
        "| Task | Role | Status | Retries |",
        "|---|---|---|---|",
        ...tasks.map((t) => `| ${t.id} | ${t.role} | ${t.status} | ${t.retryCount} |`),
        "",
        "## Approvals",
        "",
        approvals.length
          ? approvals.map((a) => `- Gate ${a.gate}: ${a.decision}${a.scope ? ` (${a.scope})` : ""} by ${a.by} at ${a.at}`).join("\n")
          : "- none recorded",
        "",
        "## Evidence files",
        "",
        evidence.length ? evidence.map((e) => `- docs/evidence/${e}`).join("\n") : "- none",
        "",
        "## Proposed deployment",
        "",
        `- Scope: ${String(task.params.deployScope ?? "unspecified")}`,
        `- Build output: ${dist}`,
        "",
        "Known defects and accepted risks are listed in docs/risk-register.md.",
        "",
      ];
      const rel = "docs/release-report.md";
      mkdirSync(join(project.workDir, "docs"), { recursive: true });
      writeFileSync(join(project.workDir, rel), lines.join("\n"), "utf8");
      return { ok: true, artifacts: [rel] };
    },

    /** Deploy to the approved provider. Re-verifies gates C and D (scoped) before any provider call. */
    "builtin.deploy": async ({ project, task, store, log }: TaskContext): Promise<TaskResult> => {
      const provider = deps.providers[String(task.params.provider)];
      if (!provider) return { ok: false, retryable: false, error: `unknown deployment provider "${String(task.params.provider)}"` };
      const projectName = String(task.params.projectName);
      const scope = provider.scopeFor(projectName);

      // Defense in depth: the orchestrator already enforced gates, but the deploy must match its own scope.
      const gate = checkGates(store, task);
      const cApproval = currentApproval(store, project.id, "C", scope);
      const dApproval = currentApproval(store, project.id, "D", scope);
      if (!gate.satisfied || cApproval?.decision !== "approved" || dApproval?.decision !== "approved" || task.approvalScope !== scope) {
        return { ok: false, retryable: false, error: `deploy to ${scope} lacks scoped Gate C and Gate D approval` };
      }
      if (deps.dryRun) {
        return { ok: false, retryable: false, error: "dry-run mode: no deployment was performed" };
      }

      // A dedicated runner is the only one that sees provider credentials.
      const runner = new CommandRunner({ projectRoot: project.workDir, secretEnv: [...provider.requiredEnv] });
      runner.grant("wrangler");
      const req = { projectName, distDir: String(task.params.distDir ?? "dist"), branch: String(task.params.branch ?? "main"), runner };
      const pre = await provider.preflight(req);
      if (!pre.ok) return { ok: false, retryable: false, error: `cannot deploy: ${pre.problems.join("; ")}` };

      const result = await provider.deploy(req);
      const secrets = runner.secretValues();
      const logPath = writeEvidence(project, `deploy-${Date.now()}`, { provider: provider.id, scope, ok: result.ok, url: result.url, log: redact(result.log, secrets), error: result.error });
      if (!result.ok) return { ok: false, error: result.error ?? "deploy failed", artifacts: [logPath] };

      const p = store.getProject(project.id)!;
      store.saveProject({
        ...p,
        deployments: [...p.deployments, { id: randomUUID(), provider: provider.id, target: scope, url: result.url, verified: false, at: new Date().toISOString() }],
      });
      log("deployed", { url: result.url });
      return { ok: true, message: `deployed to ${result.url}`, artifacts: [logPath] };
    },

    /** Verify the live URL reported by the provider. Marks the deployment verified only on success. */
    "builtin.smoke-test": async ({ project, task, store }): Promise<TaskResult> => {
      const p = store.getProject(project.id)!;
      const dep = [...p.deployments].reverse().find((d) => d.target === task.approvalScope && d.url);
      if (!dep?.url) return { ok: false, retryable: false, error: "no recorded deployment URL to verify" };

      const doFetch = deps.fetchFn ?? fetch;
      // New form: params.checks = [{ path, status?, contains? }] and params.requireHeaders. Old form: params.paths + params.contains.
      const legacyContains = task.params.contains as string | undefined;
      const checkSpecs: { path: string; status?: number; contains?: string }[] =
        (task.params.checks as { path: string; status?: number; contains?: string }[] | undefined) ??
        ((task.params.paths as string[] | undefined) ?? ["/"]).map((path) => ({ path, contains: legacyContains }));
      const requireHeaders = ((task.params.requireHeaders as string[] | undefined) ?? []).map((h) => h.toLowerCase());

      type Observed = { path: string; status: number | null; ok: boolean; note?: string; missingHeaders?: string[] };
      const checks: Observed[] = [];
      for (const spec of checkSpecs) {
        const url = new URL(spec.path, dep.url).toString();
        const wantStatus = spec.status ?? 200;
        const wantHeaders = spec.path === "/" ? requireHeaders : [];
        let last: Observed = { path: spec.path, status: null, ok: false, note: "no response" };
        for (let attempt = 0; attempt < 4 && !last.ok; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, deps.smokeRetryDelayMs ?? 5000));
          try {
            const res = await doFetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
            const body = await res.text();
            const notes: string[] = [];
            if (res.status !== wantStatus) notes.push(`expected status ${wantStatus}`);
            if (spec.contains !== undefined && !body.includes(spec.contains)) notes.push(`body missing "${spec.contains}"`);
            const missingHeaders = wantHeaders.filter((h) => !res.headers.get(h));
            if (missingHeaders.length) notes.push(`missing headers: ${missingHeaders.join(", ")}`);
            last = { path: spec.path, status: res.status, ok: notes.length === 0, note: notes.join("; ") || undefined, missingHeaders: missingHeaders.length ? missingHeaders : undefined };
          } catch (e) {
            last = { path: spec.path, status: null, ok: false, note: e instanceof Error ? e.message : String(e) };
          }
        }
        checks.push(last);
      }
      const ev = writeEvidence(project, "smoke", { url: dep.url, at: new Date().toISOString(), checks });
      if (!checks.every((c) => c.ok)) {
        return { ok: false, artifacts: [ev], error: `smoke failures: ${checks.filter((c) => !c.ok).map((c) => `${c.path} -> ${c.status ?? "no response"} ${c.note ?? ""}`).join("; ")}` };
      }
      store.saveProject({ ...p, deployments: p.deployments.map((d) => (d.id === dep.id ? { ...d, verified: true } : d)) });
      return { ok: true, artifacts: [ev], message: `verified ${dep.url}` };
    },
  };
}
