# Deployment

## Cloudflare Pages (primary)

Adapter: `packages/providers/src/cloudflare-pages.ts`. Runs `npx wrangler pages deploy <dist> --project-name <name> --branch main` (direct upload).

### Required before Gate D

1. A Cloudflare account.
2. An API token limited to *Cloudflare Pages: Edit* and the account ID, exported as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (or put in an untracked `.env`).
3. Approval of gates C and D with scope `cloudflare-pages:<project-name>`.

### Behaviour

- Preflight checks the project name, that `<dist>/index.html` exists and that both variables are set; any problem is reported by name (never by value) and the task is BLOCKED.
- The live URL is parsed from wrangler's own output (a `*.pages.dev` URL). If none is printed the deploy is a failure.
- The deployment is recorded `verified=false` until the smoke-test task fetches the live URL (HTTP 200, expected content) and records evidence.

### Free-tier limits

Free-plan quotas (builds, files per deployment, file size, bandwidth, custom domains) must be re-checked against Cloudflare's current official documentation at deploy time. **Not yet verified in this repository.** Record the findings in docs/decisions/ before Gate C.

### Rollback

Cloudflare Pages keeps prior deployments. Dashboard > Workers & Pages > project > Deployments > pick the last good deployment > Rollback. Re-run smoke tests afterwards. A failed `wrangler pages deploy` does not replace the live production deployment.
