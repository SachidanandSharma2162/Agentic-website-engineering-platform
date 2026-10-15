import type { CommandRunner } from "./runner.ts";

const PROTECTED_BRANCHES = new Set(["main", "master", "production", "release"]);

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/** Thin Git wrapper that goes through the policy-checked runner and refuses to commit to protected branches. */
export class GitTool {
  private runner: CommandRunner;
  private env: Record<string, string> | undefined;

  constructor(runner: CommandRunner, env?: Record<string, string>) {
    this.runner = runner;
    this.env = env;
  }

  private async git(args: string[]): Promise<string> {
    const r = await this.runner.run("git", args, this.env ? { env: this.env } : {});
    if (r.code !== 0) throw new GitError(`git ${args[0]} failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
    return r.stdout.trim();
  }

  /** Works on a repo with no commits yet (unlike rev-parse HEAD). Throws on detached HEAD. */
  async currentBranch(): Promise<string> {
    const b = await this.git(["branch", "--show-current"]);
    if (!b) throw new GitError("detached HEAD: check out a branch first");
    return b;
  }

  async isDirty(): Promise<boolean> {
    return (await this.git(["status", "--porcelain"])).length > 0;
  }

  async commit(message: string, paths: string[] = ["."]): Promise<string | undefined> {
    const branch = await this.currentBranch();
    if (PROTECTED_BRANCHES.has(branch)) throw new GitError(`Refusing to commit directly to protected branch "${branch}"`);
    await this.git(["add", "--", ...paths]);
    if (!(await this.isDirty())) return undefined;
    await this.git(["commit", "-m", message]);
    return this.git(["rev-parse", "HEAD"]);
  }

  /** Commit pending work (if any) and tag it so the run can resume from or roll back to this point. */
  async checkpoint(label: string): Promise<string> {
    const safe = label.replace(/[^A-Za-z0-9._-]/g, "-");
    await this.commit(`checkpoint: ${label}`);
    const sha = await this.git(["rev-parse", "HEAD"]);
    // Tag names embed the commit so tags are never moved (force flags are denied by policy).
    // An identical tag already existing means this exact state was checkpointed before.
    await this.git(["tag", `checkpoint/${safe}-${sha.slice(0, 7)}`]).catch(() => undefined);
    return sha;
  }
}
