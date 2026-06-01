# Conventions — database

Postgres + Drizzle patterns earned during STORY-03 and STORY-04.
Cookbook split out of `AGENTS.md` tier-3.

## Drizzle is the source of truth

- **Schema lives in TypeScript** at `packages/db/src/schema/*.ts`.
  Drizzle's `pg-core` builders are the authoritative description of
  the database.
- **`project_plan.md` §9 SQL is a one-time verification artefact** —
  the spec we wrote the schema against, not a live migration source.
  When schema and §9 diverge, the TS schema wins; if the divergence
  is intentional, file an ADR.
- **Migrations are generated** with `pnpm db:generate` (drizzle-kit)
  and **committed** to `packages/db/drizzle/`. Don't hand-edit
  generated SQL — re-generate after schema changes and review the
  diff.
- **Apply with** `pnpm db:migrate` from a developer machine or the
  VPS. Migration runs are not coupled to service boot — services
  fail loud if the schema is behind.
- See ADR-0005 for why Better Auth's `session` and `verification`
  tables are owned by BA's migration set, not ours.

## Two import surfaces from `@praxis/db`

`@praxis/db` deliberately exposes two entry points so callers don't
trip over the live connection at module load:

| Import | What's in it | Safe to import from |
|---|---|---|
| `@praxis/db` | Schema (`users`, `projects`, …), inferred TS types, enum constants | Anywhere — Node, Next.js build-time, tests, edge runtimes |
| `@praxis/db/client` | The `db` Drizzle client | Runtime-only code paths (server actions, API routes, orchestrator handlers) |

Tests and codegen scripts import from `@praxis/db`. Runtime code that
actually queries imports `db` from `@praxis/db/client`. **Never**
re-export `db` from `@praxis/db` — that breaks the build-time
isolation.

## Lazy initialization for env-dependent modules

Next.js page-data collection imports every module reachable from a
route, including ones that read `process.env` at module top-level.
A naive `const db = drizzle(postgres(process.env.DATABASE_URL!))`
**throws during `next build`** even if no page calls it.

The fix is a Proxy that defers initialization until first property
access:

```ts
// packages/db/src/client.ts (paraphrased)
let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  _db = drizzle(postgres(url, { max: 10 }), { schema });
  return _db;
}
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_t, prop) => Reflect.get(getDb(), prop),
});
```

The same pattern is used for the Better Auth singleton
(`apps/web/src/lib/auth.ts`) and the Resend mailer
(`apps/web/src/lib/mail.ts`). Rule: **if a module reads env, lazy-init
it.** Throwing at first real use is fine; throwing at module load
breaks tooling.

## Codegen drift check

`packages/db` has a `drift-check` script that walks the TS schema and
asserts the column shape matches `project_plan.md` §9 cell-for-cell
(name, type, nullable, default, references). It runs in CI and does
**not** need a live database — it's a pure-TypeScript walk.

When you change the schema *intentionally* (e.g. add a column to
support a story), update the drift-check expectations in the same PR
or the check fails. The check is a tripwire against unintended
divergence, not a freeze on the schema.

## Local Postgres for dev + tests

- Dev DB: `pnpm db:up` brings up Postgres 16 via Docker Compose
  (`infrastructure/deploy/docker-compose.dev.yml`).
- Tests use the same instance unless the test file imports
  `testcontainers` directly — `packages/db/src/test/with-db.ts` is
  the shared helper.
- **No mocking the database** in tests that touch persistence
  (tier-3 testing rule). We got burned in past projects when
  mock-shaped queries diverged from the real Postgres parser; spin a
  real one.

## Connection pooling

- `postgres-js` driver with `{ max: 10 }` per process — fine for both
  Next.js (one pool per server-component render) and the orchestrator
  (Bun, one pool per process).
- For per-request lifecycles, **reuse the singleton** — don't open a
  fresh connection per request. The Proxy above ensures one pool per
  process.
- The orchestrator does **not** speak directly to the database in
  STORY-05; that lands later. The lazy pattern is in place so future
  routes can `import { db } from '@praxis/db/client'` without
  refactoring.
