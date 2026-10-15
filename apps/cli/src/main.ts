import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GATES, GATE_DESCRIPTIONS, Orchestrator, StateStore, type GateId, type Project } from "@sdlc/core";
import { CloudflarePagesProvider } from "@sdlc/providers";
import { classifyRequest, createExecutors, slugify, standardWebsiteTasks } from "@sdlc/roles";
import { CommandRunner, GitTool, isInside, redact } from "@sdlc/tools";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Minimal .env loader: sets only variables that are not already defined. Never prints values. */
function loadDotEnv(): void {
  const p = join(REPO_ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    const val = raw.replace(/^(["'])(.*)\1$/, "$2");
    if (val && process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) flags[a.slice(2)] = argv[++i]!;
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

const USAGE = `sdlc: agentic website engineering platform

  init <name> "<request>" [--dir examples/<slug>] [--deploy-name <slug>]
  run <project>                       run every task that can run; stops at gates / operator work
  status <project> [--events]         task graph, approvals, deployments
  reopen  <project> <task> --reason "<why>"   re-run a task and everything downstream after a code change
  approve <project> <gate> --by <who> [--scope <s>] [--note <n>]
  reject  <project> <gate> --by <who> [--scope <s>] [--note <n>]
  projects                            list projects
  gates                               explain gates A-E

Approvals must come from a human decision. Gates: ${GATES.join(", ")}.`;

function openStore(): StateStore {
  const dir = process.env.SDLC_STATE_DIR ? resolve(process.env.SDLC_STATE_DIR) : join(REPO_ROOT, "state");
  return new StateStore(join(dir, "platform.db"), join(dir, "events.jsonl"));
}

function need(project: Project | undefined, id: string): Project {
  if (!project) throw new Error(`Unknown project "${id}". Run: sdlc projects`);
  return project;
}

async function cmdInit(args: ReturnType<typeof parseArgs>): Promise<void> {
  const [name, request] = args.positional.slice(1);
  if (!name || !request) throw new Error('usage: init <name> "<request>"');
  const slug = slugify(name);
  const dirFlag = typeof args.flags.dir === "string" ? args.flags.dir : join("examples", slug);
  const workDir = resolve(REPO_ROOT, dirFlag);
  if (!isInside(REPO_ROOT, workDir) || workDir === REPO_ROOT) {
    throw new Error(`--dir must be a sub-directory of ${REPO_ROOT} (the platform only modifies approved directories)`);
  }
  mkdirSync(workDir, { recursive: true });

  const store = openStore();
  if (store.getProject(slug)) throw new Error(`Project "${slug}" already exists`);
  const c = classifyRequest(request);
  const now = new Date().toISOString();
  const deployName = typeof args.flags["deploy-name"] === "string" ? args.flags["deploy-name"] : slug;
  const provider = new CloudflarePagesProvider();
  const project: Project = {
    id: slug, name, request, category: c.category, complexity: c.complexity, phase: "DISCOVERY",
    workDir, approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now,
  };
  store.saveProject(project);
  const orch = new Orchestrator({ store, executors: {} });
  orch.addTasks(slug, standardWebsiteTasks({
    projectId: slug, deployScope: provider.scopeFor(deployName), deployProvider: provider.id, deployProjectName: deployName,
  }));
  store.appendEvent({ projectId: slug, type: "project.created", data: { category: c.category, complexity: c.complexity, signals: c.signals } });
  console.log(`Created project "${slug}" in ${workDir}`);
  console.log(`  category: ${c.category}, complexity: ${c.complexity}${c.signals.length ? ` (signals: ${c.signals.join(", ")})` : ""}`);
  console.log(`  deploy scope: ${provider.scopeFor(deployName)}`);
  console.log(`Next: sdlc run ${slug}`);
  store.close();
}

async function cmdRun(args: ReturnType<typeof parseArgs>): Promise<void> {
  const id = args.positional[1];
  if (!id) throw new Error("usage: run <project>");
  const store = openStore();
  const project = need(store.getProject(id), id);

  const git = new GitTool(new CommandRunner({ projectRoot: REPO_ROOT }));
  const orch = new Orchestrator({
    store,
    retryMode: "per-run", // a failed check pauses the run so the operator can repair it before the next attempt
    executors: createExecutors({ providers: { "cloudflare-pages": new CloudflarePagesProvider() }, dryRun: args.flags["dry-run"] === true }),
    onCheckpoint: async (_p, task) => {
      await git.checkpoint(`${project.id}-${task.id}`);
    },
  });

  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  const summary = await orch.run(id, ac.signal);

  console.log(`\nRun summary for ${id}`);
  console.log(`  completed this run : ${summary.completed.join(", ") || "-"}`);
  for (const n of summary.needsApproval) console.log(`  needs approval     : ${n.taskId} (gate ${n.gates.join(", ")}) -> sdlc approve ${id} ${n.gates[0]} --by <you>`);
  for (const w of summary.waiting) console.log(`  waiting on operator: ${w.taskId}: ${w.message}`);
  for (const r of summary.retrying) {
    const detail = redact(r.error).split("\n").slice(0, 12).join("\n    ");
    console.log(`  FAILED, repair needed: ${r.taskId} (retry ${r.attempt} of ${r.maxRetries} used) -> fix the cause, then: sdlc run ${id}\n    ${detail}`);
  }
  for (const b of summary.blocked) console.log(`  BLOCKED            : ${b.taskId}: ${redact(b.reason).split("\n")[0]}`);
  if (summary.unreachable.length) console.log(`  unreachable        : ${summary.unreachable.join(", ")}`);
  if (summary.cancelled) console.log("  cancelled by user; interrupted task returned to READY");
  console.log(summary.done ? "  ALL TASKS COMPLETED" : "  not finished");
  store.close();
}

function cmdReopen(args: ReturnType<typeof parseArgs>): void {
  const [, id, taskId] = args.positional;
  const reason = typeof args.flags.reason === "string" ? args.flags.reason : "";
  if (!id || !taskId || !reason) throw new Error('usage: reopen <project> <task> --reason "<why>"');
  const store = openStore();
  need(store.getProject(id), id);
  const orch = new Orchestrator({ store, executors: {} });
  const reset = orch.reopen(id, taskId, reason);
  console.log(`Reopened: ${reset.join(", ")}`);
  store.close();
}

function cmdStatus(args: ReturnType<typeof parseArgs>): void {
  const id = args.positional[1];
  if (!id) throw new Error("usage: status <project>");
  const store = openStore();
  const p = need(store.getProject(id), id);
  console.log(`${p.name} [${p.id}] ${p.category}/${p.complexity}\n  dir: ${p.workDir}\n`);
  for (const t of store.listTasks(id)) {
    const extra = [t.gates.length ? `gates ${t.gates.join("+")}` : "", t.retryCount ? `retries ${t.retryCount}` : "", t.blockedReason ?? "", t.lastError ? redact(t.lastError).split("\n")[0]! : ""]
      .filter(Boolean).join(" | ");
    console.log(`  ${t.status.padEnd(15)} ${t.id.padEnd(13)} ${t.role.padEnd(12)} ${extra}`);
  }
  const approvals = store.listApprovals(id);
  console.log(`\nApprovals: ${approvals.length ? "" : "none"}`);
  for (const a of approvals) console.log(`  gate ${a.gate} ${a.decision}${a.scope ? ` [${a.scope}]` : ""} by ${a.by} at ${a.at}${a.note ? ` - ${a.note}` : ""}`);
  console.log(`\nDeployments: ${p.deployments.length ? "" : "none"}`);
  for (const d of p.deployments) console.log(`  ${d.provider} ${d.url ?? "(no url)"} verified=${d.verified} at ${d.at}`);
  if (args.flags.events) {
    console.log("\nRecent events:");
    for (const e of store.listEvents(id, 40)) console.log(`  ${e.ts} ${e.type}${e.taskId ? ` [${e.taskId}]` : ""}`);
  }
  store.close();
}

function cmdDecision(args: ReturnType<typeof parseArgs>, decision: "approved" | "rejected"): void {
  const [, id, gateRaw] = args.positional;
  const by = typeof args.flags.by === "string" ? args.flags.by : undefined;
  if (!id || !gateRaw || !by) throw new Error(`usage: ${decision === "approved" ? "approve" : "reject"} <project> <gate> --by <who> [--scope s] [--note n]`);
  const gate = gateRaw.toUpperCase() as GateId;
  if (!GATES.includes(gate)) throw new Error(`gate must be one of ${GATES.join(", ")}`);
  const store = openStore();
  need(store.getProject(id), id);
  const a = store.recordApproval({
    projectId: id, gate, decision, by,
    ...(typeof args.flags.scope === "string" ? { scope: args.flags.scope } : {}),
    ...(typeof args.flags.note === "string" ? { note: args.flags.note } : {}),
  });
  console.log(`Recorded: gate ${a.gate} ${a.decision}${a.scope ? ` [${a.scope}]` : ""} by ${a.by}`);
  store.close();
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  switch (args.positional[0]) {
    case "init": return cmdInit(args);
    case "run": case "resume": return cmdRun(args);
    case "status": return cmdStatus(args);
    case "reopen": return cmdReopen(args);
    case "approve": return cmdDecision(args, "approved");
    case "reject": return cmdDecision(args, "rejected");
    case "projects": {
      const s = openStore();
      for (const p of s.listProjects()) console.log(`${p.id}\t${p.category}\t${p.workDir}`);
      s.close();
      return;
    }
    case "gates":
      for (const g of GATES) console.log(`  ${g}  ${GATE_DESCRIPTIONS[g]}`);
      return;
    default:
      console.log(USAGE);
  }
}

main().catch((e) => {
  console.error(`error: ${redact(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 1;
});
