# Deployment: Studio Slot

**Nothing has been deployed or created in any Cloudflare account yet.** This is the plan, and every step below that changes a real account is a Gate E action that needs your explicit approval first.

## Target
Cloudflare Pages (static site plus Pages Functions) with one D1 database, on the free plan. Project name `studio-slot`, address `https://studio-slot.pages.dev` (a custom domain is optional and out of scope).

## Free-tier limits (official documentation, checked 2026-10-16)
| Resource | Limit | Expected use |
|---|---|---|
| Workers / Pages Functions requests | 100,000 a day, shared, reset 00:00 UTC | about 1,500 a day |
| CPU time | 10 ms per request | to be measured after deployment |
| D1 rows read / written | 5 million / 100,000 a day | about 100,000 / 100 a day |
| D1 storage | 5 GB total | well under 1 MB |
Going over a daily limit returns errors; the site shows a "we're at capacity" message instead of breaking.

## Steps that need approval (Gate E), in order
1. **Token.** Create a Cloudflare API token with exactly these permissions on your account: Account > Cloudflare Pages > Edit, and Account > D1 > Edit. Give it a short expiry and revoke it afterwards. Put it in the repository's untracked \`.env\` as \`CLOUDFLARE_API_TOKEN\` (and \`CLOUDFLARE_ACCOUNT_ID\`). Never paste it into chat.
2. **Create the database:** \`npx wrangler d1 create studio-slot-db\`, then put the returned id into \`wrangler.toml\` (it currently holds a placeholder that is only used locally).
3. **Apply the migration:** \`npx wrangler d1 migrations apply studio-slot-db --remote\` (adds three tables; no existing data).
4. **Create the Pages project and attach D1.** The binding is declared in \`wrangler.toml\`. **Unverified:** how a direct-upload deploy attaches the binding; the first deploy will show whether \`wrangler pages deploy\` picks it up from \`wrangler.toml\` or whether the binding must be set on the project. This is checked before Gate C and the deploy fails closed.
5. **Set the two secrets:** \`npx wrangler pages secret put ADMIN_PASSPHRASE --project-name studio-slot\` and the same for \`SESSION_SECRET\` (16+ random characters). You choose the passphrase; it is never written to the repository or logs.
6. **Deploy** the approved release candidate through the platform (\`sdlc run studio-slot\` after Gates C and D), which uploads \`dist/\` and the \`functions/\` directory.

## Verification after deployment
The platform's smoke task checks the routes, content and security headers. In addition run the full end-to-end suite against the live address:
\`\`\`
BROWSERS=all BASE_URL=https://studio-slot.pages.dev E2E_ADMIN_PASSPHRASE=<the passphrase> npm run e2e
\`\`\`
and confirm the deployed bundle hash equals the approved build. Check one real booking and cancellation, and measure request CPU time in the Cloudflare dashboard against the 10 ms limit.

## Rollback and recovery
- **Site and functions:** Cloudflare Pages keeps every deployment; roll back from the dashboard (Workers & Pages > studio-slot > Deployments > Rollback), then re-run the live E2E suite.
- **Database:** the first migration is additive, so there is nothing to undo. Back up before any later migration with \`npx wrangler d1 export studio-slot-db --remote --output backup.sql\`. A migration that drops or rewrites data needs Gate E approval.
- **Taking the site down:** deleting the Pages project or the database is a Gate E action; bookings (names and emails) are lost with the database.
- **Secrets:** rotate by setting new values with \`wrangler pages secret put\`; existing owner sessions end when \`SESSION_SECRET\` changes.

## Local development
\`npm run build && npm start\` serves the built site and the API on http://127.0.0.1:8788 with a SQLite file in \`.data/\` (owner passphrase \`dev-passphrase\`). For the real Functions runtime: \`npx wrangler d1 migrations apply studio-slot-db --local\` then \`npx wrangler pages dev --binding ADMIN_PASSPHRASE=... --binding SESSION_SECRET=... --binding COOKIE_INSECURE=1\`.
