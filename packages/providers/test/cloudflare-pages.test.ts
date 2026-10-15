import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandRunner } from "@sdlc/tools";
import { CloudflarePagesProvider } from "../src/index.ts";

type Reply = { code: number; stdout?: string; stderr?: string };

/** A runner that replays scripted wrangler replies and records the commands it was asked to run. */
function fakeRunner(replies: Reply[]) {
  const dir = mkdtempSync(join(tmpdir(), "cfp-"));
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "index.html"), "<html></html>");
  const calls: string[][] = [];
  const runner = {
    root: dir,
    async run(_cmd: string, args: string[]) {
      calls.push(args);
      const r = replies.shift() ?? { code: 99, stderr: "unexpected extra call" };
      return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: false, durationMs: 1, command: `npx ${args.join(" ")}` };
    },
  } as unknown as CommandRunner;
  return { runner, calls };
}

const req = (runner: CommandRunner) => ({ projectName: "focus-board", distDir: "dist", branch: "main", runner });

async function withEnv(fn: () => Promise<void>) {
  const prev = { t: process.env.CLOUDFLARE_API_TOKEN, a: process.env.CLOUDFLARE_ACCOUNT_ID };
  process.env.CLOUDFLARE_API_TOKEN = "x";
  process.env.CLOUDFLARE_ACCOUNT_ID = "y";
  try {
    await fn();
  } finally {
    if (prev.t === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = prev.t;
    if (prev.a === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = prev.a;
  }
}

const MISSING = 'X [ERROR] The Pages project "focus-board" does not exist.';
const OK = "Deployment complete! Take a peek over at https://abc123.focus-board.pages.dev";

describe("CloudflarePagesProvider.deploy", () => {
  it("deploys directly when the project exists", async () => {
    await withEnv(async () => {
      const { runner, calls } = fakeRunner([{ code: 0, stdout: OK }]);
      const r = await new CloudflarePagesProvider().deploy(req(runner));
      expect(r).toMatchObject({ ok: true, url: "https://abc123.focus-board.pages.dev" });
      expect(calls).toHaveLength(1);
    });
  });

  it("creates a missing project once, then retries the deploy and reports the real URL", async () => {
    await withEnv(async () => {
      const { runner, calls } = fakeRunner([{ code: 1, stderr: MISSING }, { code: 0, stdout: "Successfully created the 'focus-board' project." }, { code: 0, stdout: OK }]);
      const r = await new CloudflarePagesProvider().deploy(req(runner));
      expect(r).toMatchObject({ ok: true, url: "https://abc123.focus-board.pages.dev" });
      expect(calls.map((c) => c.slice(1, 4).join(" "))).toEqual(["pages deploy dist", "pages project create", "pages deploy dist"]);
      expect(calls[1]).toContain("focus-board");
      expect(calls[1]).toContain("--production-branch");
    });
  });

  it("does not create anything for other failures", async () => {
    await withEnv(async () => {
      const { runner, calls } = fakeRunner([{ code: 1, stderr: "Authentication error [code: 10000]" }]);
      const r = await new CloudflarePagesProvider().deploy(req(runner));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/exited with code 1/);
      expect(calls).toHaveLength(1);
    });
  });

  it("reports a failed project creation without retrying the deploy", async () => {
    await withEnv(async () => {
      const { runner, calls } = fakeRunner([{ code: 1, stderr: MISSING }, { code: 1, stderr: "not authorized to create projects" }]);
      const r = await new CloudflarePagesProvider().deploy(req(runner));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/creating Pages project "focus-board" failed/);
      expect(calls).toHaveLength(2);
    });
  });

  it("fails if the retry succeeds but no pages.dev URL was printed", async () => {
    await withEnv(async () => {
      const { runner } = fakeRunner([{ code: 1, stderr: MISSING }, { code: 0 }, { code: 0, stdout: "done" }]);
      const r = await new CloudflarePagesProvider().deploy(req(runner));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/no pages\.dev URL/);
    });
  });
});
