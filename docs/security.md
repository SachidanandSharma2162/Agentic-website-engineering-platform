# Security

## Command runner (packages/tools)

- Executables are an allowlist: `node`, `npm`, `npx`, `git`. Everything else (curl, shells, python...) is denied. No shell is ever used (`shell: false`); npm and npx are launched through their JS entry points.
- `node -e/-p/--eval/--print/--input-type` (inline code) is denied. `npm publish/login/config/-g` and similar are denied. `npx` only runs allowlisted packages (vitest, tsc, playwright, wrangler, vite, eslint, prettier).
- Needs approval: `npm --force`, `npm audit fix`, any `wrangler` command beyond `--version`/`whoami`, and git network operations (push/pull/fetch/clone/remote).
- Denied git: reset, clean, restore, rebase, force flags, `branch -D`, `checkout -- / .`. The Git tool refuses to commit on `main`, `master`, `production`, `release`.
- Path jail: the working directory and every path-like argument must resolve inside the project root (absolute paths and `..` escapes are rejected, including `--flag=../x`).
- Child processes receive a minimal environment. Secrets are passed only to a runner explicitly configured with those variable names, and are redacted (exact values plus common token shapes) from all captured output.
- Timeouts kill the whole process tree. Output is capped at 1 MB.

## Limits

This is a policy layer, not a sandbox. Project code that the allowlisted tools execute (npm scripts, node files) runs with the user's privileges. Treat third-party repositories and generated code as untrusted until reviewed.

## Secrets

Only `.env.example` is committed. `.env` is git-ignored. The CLI loads `.env` without printing values. Cloudflare credentials are visible only to the deploy runner.

## Untrusted input

Text from web pages, repositories and user content is data. Instructions embedded in it do not change policy; policy is enforced in code.
