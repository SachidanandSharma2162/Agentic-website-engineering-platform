import { isAbsolute, relative, resolve } from "node:path";

export type Verdict =
  | { verdict: "allow" }
  | { verdict: "deny"; reason: string }
  | { verdict: "approval"; action: string; reason: string };

const NPX_PACKAGES = new Set(["vitest", "tsc", "playwright", "wrangler", "vite", "eslint", "prettier"]);
const NPM_ALLOWED = new Set([
  "install", "i", "ci", "run", "run-script", "test", "t", "audit", "ls", "list", "view", "info",
  "outdated", "uninstall", "pack", "version", "--version", "-v",
]);
const NPM_DENIED = new Set([
  "publish", "unpublish", "deprecate", "login", "logout", "adduser", "token", "owner", "access",
  "profile", "team", "org", "config", "set", "dist-tag", "star", "hook", "whoami",
]);
const GIT_ALLOWED = new Set([
  "init", "status", "add", "commit", "branch", "checkout", "switch", "diff", "log", "tag", "rev-parse",
  "show", "ls-files", "merge", "stash", "--version",
]);
const GIT_NETWORK = new Set(["push", "pull", "fetch", "clone", "remote"]);
const GIT_DESTRUCTIVE = new Set(["reset", "clean", "restore", "rebase", "filter-branch", "gc", "prune", "update-ref"]);
const WRANGLER_SAFE = new Set(["--version", "-v", "--help", "-h", "whoami"]);

/** Strip directory and extension from an executable name. */
export function baseName(cmd: string): string {
  return cmd.replace(/\.(exe|cmd|bat)$/i, "").toLowerCase();
}

const firstPositional = (args: string[]): string | undefined => args.find((a) => !a.startsWith("-"));

/**
 * Pure policy decision for a command. This is a guard rail, not an OS sandbox: it narrows what the
 * platform will launch, but an allowed `node script.js` or `npm run x` still executes project code.
 */
export function evaluateCommand(cmd: string, args: string[]): Verdict {
  if (/[\\/]/.test(cmd)) return { verdict: "deny", reason: "executable must be a bare name, not a path" };
  const name = baseName(cmd);
  const sub = firstPositional(args) ?? args[0];

  switch (name) {
    case "node": {
      // -e/-p (also in clusters like -pe), --eval/--print/--input-type, with or without "=value"
      const bad = args.find((a) => /^(--(eval|print|input-type)(=.*)?|-[A-Za-z]*[ep][A-Za-z]*)$/.test(a));
      if (bad) return { verdict: "deny", reason: `node ${bad} (inline code) is not allowed` };
      return { verdict: "allow" };
    }
    case "npm": {
      if (args.some((a) => a === "-g" || a === "--global")) return { verdict: "deny", reason: "global npm operations are not allowed" };
      if (!sub || NPM_DENIED.has(sub)) return { verdict: "deny", reason: `npm ${sub ?? "(none)"} is not allowed` };
      if (!NPM_ALLOWED.has(sub)) return { verdict: "deny", reason: `npm ${sub} is not on the allowlist` };
      if (args.some((a) => a === "--force" || a === "-f")) {
        return { verdict: "approval", action: "npm-force", reason: "npm --force can overwrite or break dependencies" };
      }
      if (sub === "audit" && args.includes("fix")) {
        return { verdict: "approval", action: "npm-audit-fix", reason: "audit fix modifies the dependency tree" };
      }
      return { verdict: "allow" };
    }
    case "npx": {
      const pkg = args.find((a) => !a.startsWith("-"));
      if (!pkg) return { verdict: "deny", reason: "npx requires an allowlisted package" };
      const pkgName = pkg.replace(/@[^/@]+$/, ""); // drop @version
      if (!NPX_PACKAGES.has(pkgName)) return { verdict: "deny", reason: `npx package "${pkgName}" is not on the allowlist` };
      if (pkgName === "wrangler") {
        const rest = args.slice(args.indexOf(pkg) + 1);
        if (!rest.every((a) => WRANGLER_SAFE.has(a))) {
          return { verdict: "approval", action: "wrangler", reason: "wrangler can publish to or modify a live account" };
        }
      }
      return { verdict: "allow" };
    }
    case "git": {
      if (args.some((a) => a === "--force" || a === "-f" || a === "--force-with-lease" || a === "-D" || a === "--hard")) {
        return { verdict: "deny", reason: "force/destructive git flags are not allowed" };
      }
      if (!sub) return { verdict: "deny", reason: "git requires a subcommand" };
      if (GIT_DESTRUCTIVE.has(sub)) return { verdict: "deny", reason: `git ${sub} can destroy work` };
      if (GIT_NETWORK.has(sub)) {
        return { verdict: "approval", action: "git-network", reason: `git ${sub} contacts or changes a remote` };
      }
      if (!GIT_ALLOWED.has(sub)) return { verdict: "deny", reason: `git ${sub} is not on the allowlist` };
      if (sub === "checkout" && (args.includes("--") || args.includes("."))) {
        return { verdict: "deny", reason: "git checkout of paths discards working-tree changes" };
      }
      return { verdict: "allow" };
    }
    default:
      return { verdict: "deny", reason: `"${name}" is not on the executable allowlist` };
  }
}

/** True if `target` is `root` or inside it. */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

const VALUE_TAKING_FLAGS = new Set(["-m", "--message", "-F"]);

/** Reject any argument that points outside the project root (absolute paths or `..` escapes). */
export function checkPathArgs(args: string[], root: string, cwd: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (VALUE_TAKING_FLAGS.has(a)) {
      i++; // free text, not a path
      continue;
    }
    const value = a.startsWith("-") ? (a.includes("=") ? a.slice(a.indexOf("=") + 1) : "") : a;
    if (!value || value.includes("://") || /^@?[\w.-]+@[\w.^~<>=*-]+$/.test(value)) continue; // URLs, pkg@version
    const looksAbsolute = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
    const hasDotDot = /(^|[\\/])\.\.([\\/]|$)/.test(value);
    if (looksAbsolute && !isInside(root, value)) return `path argument escapes project root: ${value}`;
    if (hasDotDot && !isInside(root, resolve(cwd, value))) return `path argument escapes project root: ${value}`;
  }
  return undefined;
}
