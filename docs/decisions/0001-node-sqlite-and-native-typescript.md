# ADR 0001: node:sqlite and native TypeScript execution

**Status:** accepted (2026-10-15)

**Context:** The platform needs a persistent local state store and should run on a bare Node install. `better-sqlite3` requires a native build, which is risky on a very new Node (26.x) on Windows.

**Decision:** Use the built-in `node:sqlite` and run TypeScript directly through Node's type stripping (`erasableSyntaxOnly`, `.ts` import specifiers), with `tsc --noEmit` for type-checking only. Requires Node >= 22.18.

**Consequences:** No native compilation and no transpile step. `node:sqlite` is a relatively young API and may print an experimental warning on some Node versions. Enums, namespaces and parameter properties are not allowed in source.

# ADR 0002: Vitest 5

Vitest 3.x pulled in a critical advisory (tinypool prototype-pollution RCE). Upgraded to 5.x; `npm audit` reports 0 vulnerabilities.
