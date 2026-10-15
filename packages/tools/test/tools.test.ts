import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CommandRunner, GitTool, PolicyError, evaluateCommand, redact } from "../src/index.ts";

let root: string;
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-tools-")));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("evaluateCommand policy", () => {
  const verdict = (c: string, ...a: string[]) => evaluateCommand(c, a).verdict;

  it("allows ordinary build/test commands", () => {
    expect(verdict("npm", "ci")).toBe("allow");
    expect(verdict("npm", "run", "build")).toBe("allow");
    expect(verdict("npx", "vitest", "run")).toBe("allow");
    expect(verdict("node", "script.js")).toBe("allow");
    expect(verdict("git", "status")).toBe("allow");
    expect(verdict("npx", "tsc@5.9.3", "--noEmit")).toBe("allow");
  });

  it("denies executables that are not allowlisted", () => {
    for (const c of ["curl", "powershell", "cmd", "bash", "rm", "del", "python", "sh"]) expect(verdict(c, "x")).toBe("deny");
    expect(verdict("C:\\Windows\\System32\\cmd.exe", "/c", "dir")).toBe("deny");
    expect(verdict("./node", "x")).toBe("deny");
  });

  it("denies inline node code and global/publish npm operations", () => {
    expect(verdict("node", "-e", "process.exit()")).toBe("deny");
    expect(verdict("node", "--eval=1")).toBe("deny");
    expect(verdict("node", "-p", "1")).toBe("deny");
    expect(verdict("npm", "publish")).toBe("deny");
    expect(verdict("npm", "login")).toBe("deny");
    expect(verdict("npm", "install", "-g", "x")).toBe("deny");
    expect(verdict("npm", "config", "set", "a", "b")).toBe("deny");
    expect(verdict("npm", "exec", "evil")).toBe("deny");
  });

  it("only allows npx on allowlisted packages", () => {
    expect(verdict("npx", "some-random-pkg")).toBe("deny");
    expect(verdict("npx", "--yes", "left-pad")).toBe("deny");
    expect(verdict("npx")).toBe("deny");
  });

  it("requires approval for npm --force, audit fix, wrangler, and git network operations", () => {
    expect(evaluateCommand("npm", ["install", "--force"])).toMatchObject({ verdict: "approval", action: "npm-force" });
    expect(evaluateCommand("npm", ["audit", "fix"])).toMatchObject({ verdict: "approval", action: "npm-audit-fix" });
    expect(evaluateCommand("npx", ["wrangler", "pages", "deploy", "dist"])).toMatchObject({ verdict: "approval", action: "wrangler" });
    expect(verdict("npx", "wrangler", "--version")).toBe("allow");
    expect(evaluateCommand("git", ["push", "origin", "x"])).toMatchObject({ verdict: "approval", action: "git-network" });
  });

  it("denies destructive git operations", () => {
    expect(verdict("git", "reset", "--hard")).toBe("deny");
    expect(verdict("git", "clean", "-fd")).toBe("deny");
    expect(verdict("git", "push", "--force")).toBe("deny");
    expect(verdict("git", "branch", "-D", "x")).toBe("deny");
    expect(verdict("git", "checkout", ".")).toBe("deny");
    expect(verdict("git", "checkout", "--", "file")).toBe("deny");
    expect(verdict("git", "rebase", "main")).toBe("deny");
    expect(verdict("git", "config", "user.name", "x")).toBe("deny");
  });
});

describe("CommandRunner", () => {
  it("runs an allowed command inside the project root", async () => {
    const runner = new CommandRunner({ projectRoot: root });
    const r = await runner.run("node", ["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^v\d+/);
  });

  it("rejects cwd outside the root, absolute paths outside, and .. escapes", async () => {
    const runner = new CommandRunner({ projectRoot: root });
    await expect(runner.run("node", ["--version"], { cwd: tmpdir() })).rejects.toThrow(PolicyError);
    await expect(runner.run("node", ["C:\\Windows\\System32\\x.js"])).rejects.toThrow(/escapes project root/);
    await expect(runner.run("node", ["/etc/passwd"])).rejects.toThrow(/escapes project root/);
    await expect(runner.run("node", ["..\\..\\x.js"])).rejects.toThrow(/escapes project root/);
    await expect(runner.run("node", ["--import=../evil.js"])).rejects.toThrow(/escapes project root/);
  });

  it("allows paths that stay inside the root", async () => {
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "sub", "ok.js"), "console.log('inside')");
    const runner = new CommandRunner({ projectRoot: root });
    expect((await runner.run("node", [join(root, "sub", "ok.js")])).stdout.trim()).toBe("inside");
    expect((await runner.run("node", ["sub/../sub/ok.js"])).stdout.trim()).toBe("inside");
  });

  it("denies disallowed commands before spawning", async () => {
    const runner = new CommandRunner({ projectRoot: root });
    await expect(runner.run("curl", ["https://example.com"])).rejects.toMatchObject({ kind: "deny" });
  });

  it("demands approval until the action is granted, then lets the policy pass", () => {
    const runner = new CommandRunner({ projectRoot: root });
    const args = ["wrangler", "pages", "deploy", "dist"];
    expect(() => runner.assertAllowed("npx", args)).toThrowError(/Approval required/);
    runner.grant("wrangler");
    expect(() => runner.assertAllowed("npx", args)).not.toThrow();
    runner.revoke("wrangler");
    expect(() => runner.assertAllowed("npx", args)).toThrow(PolicyError);
  });

  it("kills commands that exceed the timeout", async () => {
    writeFileSync(join(root, "hang.js"), "setTimeout(() => {}, 60000)");
    const runner = new CommandRunner({ projectRoot: root });
    const r = await runner.run("node", ["hang.js"], { timeoutMs: 400 });
    expect(r.timedOut).toBe(true);
    expect(r.durationMs).toBeLessThan(10_000);
  });

  it("redacts secrets from output, and does not leak unlisted env vars to children", async () => {
    process.env.SDLC_TEST_SECRET = "super-secret-value-123";
    process.env.SDLC_TEST_LEAK = "should-not-be-visible";
    writeFileSync(
      join(root, "env.js"),
      "console.log('secret=' + process.env.SDLC_TEST_SECRET); console.log('leak=' + process.env.SDLC_TEST_LEAK); console.error('Authorization: Bearer abcdefghijkl123456')",
    );
    const runner = new CommandRunner({ projectRoot: root, secretEnv: ["SDLC_TEST_SECRET"] });
    const r = await runner.run("node", ["env.js"]);
    expect(r.stdout).not.toContain("super-secret-value-123");
    expect(r.stdout).toContain("[REDACTED]");
    expect(r.stdout).toContain("leak=undefined");
    expect(r.stderr).not.toContain("abcdefghijkl123456");
    delete process.env.SDLC_TEST_SECRET;
    delete process.env.SDLC_TEST_LEAK;
  });

  it("reports non-zero exit codes without throwing", async () => {
    writeFileSync(join(root, "fail.js"), "console.error('bad'); process.exit(3)");
    const runner = new CommandRunner({ projectRoot: root });
    const r = await runner.run("node", ["fail.js"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("bad");
  });
});

describe("redact", () => {
  it("masks common secret shapes and named values", () => {
    const out = redact(
      "api_key=abcd1234efgh token: xyz987 password='hunter22' ghp_abcdefghijklmnopqrstuvwxyz0123 sk-abcdefghijklmnopqrstu AKIAABCDEFGHIJKLMNOP",
    );
    for (const leaked of ["abcd1234efgh", "xyz987", "hunter22", "ghp_abc", "sk-abcdef", "AKIAABC"]) expect(out).not.toContain(leaked);
    expect(out).toContain("api_key=[REDACTED]");
  });
  it("masks explicit secret values but ignores very short ones", () => {
    expect(redact("the value is cf-token-0001", ["cf-token-0001"])).toBe("the value is [REDACTED]");
    expect(redact("abc", ["abc"])).toBe("abc");
  });
  it("leaves ordinary text alone", () => {
    expect(redact("build completed in 12s with 0 errors")).toBe("build completed in 12s with 0 errors");
  });
});

describe("GitTool", () => {
  const env = {
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
  };

  it("refuses to commit on a protected branch, commits and checkpoints on a feature branch", async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-git-")));
    try {
      const runner = new CommandRunner({ projectRoot: repo });
      await runner.run("git", ["init", "-b", "main"], { env });
      const git = new GitTool(runner, env);
      writeFileSync(join(repo, "a.txt"), "1");
      await expect(git.commit("nope")).rejects.toThrow(/protected branch/);

      await runner.run("git", ["checkout", "-b", "feat/x"]);
      expect(await git.commit("first")).toMatch(/^[0-9a-f]{40}$/);
      expect(await git.commit("nothing to commit")).toBeUndefined();

      writeFileSync(join(repo, "b.txt"), "2");
      const sha = await git.checkpoint("before deploy");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      const tags = await runner.run("git", ["tag"]);
      expect(tags.stdout).toContain(`checkpoint/before-deploy-${sha.slice(0, 7)}`);
      expect(await git.isDirty()).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
