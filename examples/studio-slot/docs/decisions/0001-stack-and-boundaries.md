# ADR 0001: Pages Functions + D1, one handler shared by every runtime

Status: accepted at Gate A; refined during the build.

## Decision
The whole API is one function from `Request` to `Response` (`server/app.ts`). Cloudflare Pages Functions mount it with a three-line wrapper; the Node dev server and the tests call the same function. Services depend on a tiny `Db` interface (`run`, `first`, `all`) with two adapters: D1 for production and Node's SQLite for tests and local use. Plain SQL, no ORM.

## Why
- Tests run the real handler against real SQLite, including multi-process concurrency, without any Cloudflare account.
- The same SQL and handler were then run unchanged on the real Pages Functions runtime with a local D1 (workerd): all 41 E2E tests pass there too, so the abstraction is not hiding a behavioural difference we know of.
- Capacity, uniqueness and cascade-delete are database constraints, not application checks.

## Consequences
- Anything not expressible in the `Db` interface (transactions, batches) would need extending both adapters; the design deliberately needs none.
- Vendor lock-in is limited to the thin wrapper and `wrangler.toml`.
- No Tailwind (ADR 0002 of the first site explains the collision it caused); styles are plain CSS ported from the approved prototype.
