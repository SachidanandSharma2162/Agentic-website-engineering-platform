import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { checkPathArgs, evaluateCommand, isInside, baseName } from "./policy.ts";
import { redact } from "./redact.ts";

export class PolicyError extends Error {
  readonly kind: "deny" | "approval";
  readonly action: string | undefined;
  constructor(kind: "deny" | "approval", message: string, action?: string) {
    super(message);
    this.name = "PolicyError";
    this.kind = kind;
    this.action = action;
  }
}

export interface RunnerConfig {
  /** Directory the runner may operate in. Commands cannot use a cwd or paths outside it. */
  projectRoot: string;
  /** Names of environment variables whose values may be passed through (and are always redacted). */
  secretEnv?: string[];
  /** Policy "approval" actions that have already been granted (e.g. "wrangler" after Gate D). */
  approvedActions?: Iterable<string>;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Extra environment, supplied by trusted platform code. */
  env?: Record<string, string>;
  maxOutputBytes?: number;
}

export interface RunResult {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

const BASE_ENV_KEYS = [
  "PATH", "Path", "SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA",
  "LOCALAPPDATA", "ProgramFiles", "ProgramData", "HOMEDRIVE", "HOMEPATH", "COMSPEC", "PATHEXT", "LANG",
];

/** Resolve how to launch an allowlisted tool without going through a shell. */
function resolveLauncher(name: string): { file: string; prefix: string[] } {
  if (name === "node") return { file: process.execPath, prefix: [] };
  if (name === "npm" || name === "npx") {
    const bin = name === "npm" ? "npm-cli.js" : "npx-cli.js";
    const nodeDir = dirname(process.execPath);
    for (const base of [join(nodeDir, "node_modules", "npm", "bin"), join(nodeDir, "..", "lib", "node_modules", "npm", "bin")]) {
      const p = join(base, bin);
      if (existsSync(p)) return { file: process.execPath, prefix: [p] };
    }
    throw new Error(`Cannot locate ${bin} next to the node executable`);
  }
  return { file: name, prefix: [] };
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export class CommandRunner {
  readonly root: string;
  private secretNames: string[];
  private approved: Set<string>;

  constructor(cfg: RunnerConfig) {
    this.root = realpathSync(resolve(cfg.projectRoot));
    this.secretNames = cfg.secretEnv ?? [];
    this.approved = new Set(cfg.approvedActions ?? []);
  }

  grant(action: string): void {
    this.approved.add(action);
  }

  revoke(action: string): void {
    this.approved.delete(action);
  }

  /** Throws PolicyError unless the command is permitted (now). Does not execute anything. */
  assertAllowed(cmd: string, args: string[], cwd?: string): string {
    const realCwd = realpathSync(resolve(this.root, cwd ?? "."));
    if (!isInside(this.root, realCwd)) throw new PolicyError("deny", `cwd is outside the project root: ${realCwd}`);
    const v = evaluateCommand(cmd, args);
    if (v.verdict === "deny") throw new PolicyError("deny", `Denied: ${v.reason}`);
    if (v.verdict === "approval" && !this.approved.has(v.action)) {
      throw new PolicyError("approval", `Approval required (${v.action}): ${v.reason}`, v.action);
    }
    const pathProblem = checkPathArgs(args, this.root, realCwd);
    if (pathProblem) throw new PolicyError("deny", `Denied: ${pathProblem}`);
    return realCwd;
  }

  secretValues(extra: Record<string, string> = {}): string[] {
    const vals = this.secretNames.map((n) => process.env[n]).filter((v): v is string => !!v);
    for (const n of this.secretNames) if (extra[n]) vals.push(extra[n]);
    return vals;
  }

  async run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
    const cwd = this.assertAllowed(cmd, args, opts.cwd);
    const { file, prefix } = resolveLauncher(baseName(cmd));

    const env: Record<string, string> = {};
    for (const k of BASE_ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k]!;
    for (const k of this.secretNames) if (process.env[k] !== undefined) env[k] = process.env[k]!;
    Object.assign(env, opts.env);

    const secrets = this.secretValues(opts.env);
    const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
    const cap = opts.maxOutputBytes ?? 1_000_000;
    const started = Date.now();

    return await new Promise<RunResult>((resolvePromise, reject) => {
      const child = spawn(file, [...prefix, ...args], { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      const take = (cur: string, chunk: Buffer): string => {
        if (cur.length >= cap) {
          truncated = true;
          return cur;
        }
        return cur + chunk.toString("utf8");
      };
      child.stdout.on("data", (c: Buffer) => (stdout = take(stdout, c)));
      child.stderr.on("data", (c: Buffer) => (stderr = take(stderr, c)));
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolvePromise({
          command: redact([cmd, ...args].join(" "), secrets),
          code,
          stdout: redact(stdout, secrets),
          stderr: redact(stderr, secrets),
          timedOut,
          truncated,
          durationMs: Date.now() - started,
        });
      });
    });
  }
}
