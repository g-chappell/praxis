# CLAUDE.md — Praxis

> Three tiers of rules live here, clearly separated. `autonomous-review` only
> proposes additions to Tier 2 (project conventions) and Tier 3 (tech-coupled).
> Tier 1 (universal rules) is frozen — do not edit.

## Project overview

Praxis is a collaborative workspace where two non-technical or lightly-technical
people build, deploy, and learn together with AI coding agents. The platform
hosts Claude Code (and later Codex) in a managed multiplayer environment.
Pairs pick a template, prompt the agent, and end the session with a working
app at a live preview URL, a git history that shows how they built it, and
material added to each user's portfolio. The POC runs entirely on a single
VPS — Next.js frontend, Bun/Hono orchestrator, Docker-per-project sandboxes,
all behind Caddy. Engineering concentrates on two abstractions that must
survive the next 12 months: the ACP host layer (so any ACP-speaking agent
plugs in) and the Sandbox interface (so Docker can be swapped for E2B or
Firecracker without touching consumers).

## Tech stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 14 App Router (apps/web) + Hono on Bun (services/orchestrator)
- **Runtime:** Node 20 for tools and web; Bun 1 for the orchestrator
- **Database:** Postgres 16 (managed by drizzle-kit or kysely)
- **Test framework:** Vitest (unit + integration); Playwright (end-to-end)
- **Lint + format:** Prettier 3 + ESLint 9 (flat config). See ADR-0003.
- **CI:** GitHub Actions
- **Deploy:** Docker + Caddy on a single VPS (target: `praxis.local`); auto-deploy on merge to main

## Key commands

```bash
pnpm -r --parallel --if-present dev   # start all dev servers (web, orchestrator)
pnpm test                             # run all tests (root Vitest)
pnpm -r --if-present typecheck        # tsc --noEmit across workspaces
pnpm lint                             # prettier --check && eslint
pnpm format                           # prettier --write && eslint --fix
pnpm -r --if-present build            # production build for all workspaces
```

## Workspace structure

```
apps/web                       Next.js frontend (landing, dashboard, workspace UI)
services/orchestrator          Bun + Hono — WebSocket hub, ACP host driver, sandbox lifecycle
packages/db                    Postgres schema, migrations, codegened types
packages/sandbox               Sandbox interface + DockerSandbox implementation
packages/acp-host              ACP JSON-RPC host (spawn agent, stream events)
packages/crypto                libsodium-based encrypt/decrypt for OAuth tokens at rest
packages/shared                Types and constants shared across web + orchestrator
templates/react-threejs-scene  POC template — Vite + React + @react-three/fiber + drei
infrastructure/caddy           Caddyfile(s) (app, api, *.preview wildcards)
infrastructure/docker          Dockerfiles (sandbox base image, web image, etc.)
infrastructure/deploy          systemd units, docker-compose.dev.yml, deploy runbooks
infrastructure/mcp-servers     MCP servers (image-gen for POC)
```

---

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 1 — UNIVERSAL RULES. Frozen. autonomous-review will never modify. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Universal rules

- **Implement to the Story, not the literal Task body.** Each task you pick is one slice of a Story. Read the Story's `acceptance_criteria`, `user_flow`, and `out_of_scope` from `roadmap/roadmap.yml` BEFORE writing any code (the autonomous cycle's Step 5 picker emits the parent `storyId`; Step 7 prose tells you to load it). Your work must move the Story toward "all AC satisfied" — never produce stubs, placeholders, or mock data that would fail an AC if exercised end-to-end. Adding work strictly outside the Story's scope is still forbidden — refine via `/roadmap-add` first.
- **No stubs, no placeholders. Ever.** If during implementation you discover the current task can't be completed without producing a stub/placeholder, **do not ship the stub**. Two paths:
  1. Auto-add follow-up tasks via `node scripts/roadmap-followup.mjs <TASK-ID> --reason "<why>" --add-tasks "<title>;<title>"` and continue the current task only if its own `task_acceptance` can be met WITHOUT the stub. The new follow-ups land in the same PR under the same Story; `select-task.mjs` picks them first in the next cycle.
  2. Mark the task `status: blocked` with a clear `blocked_reason` and stop the cycle if the gap is ambiguous (design decision needed) or the current task itself can't satisfy its `task_acceptance` without the stub.

  A "stub" is any of:
  - A function that returns a hardcoded placeholder string (`"Coming soon"`, `"TODO"`, `"lorem ipsum"`, `"TBD"`)
  - A UI element rendered with mock/fake data when the real source exists
  - A `TODO`/`FIXME`/`XXX` comment without a `(TASK-NNN)` reference to a roadmap task that resolves it
  - An exported symbol that throws `"not implemented"` or returns `null`/`undefined` while the caller's contract requires a value
  - A route, button, or menu item that renders nothing or no-ops on click

  The `stub-scan.mjs` PostToolUse hook catches the obvious cases at edit time (fail-fast). The Step 8.5 acceptance check (`scripts/story-acceptance-check.mjs`) re-scans the full branch diff and runs an LLM judgment against the Story's AC before the PR opens — both layers run.
- Edit one file at a time. Run typecheck + targeted tests after each edit before moving to the next.
- Read the full file/component before modifying it. Verify all sibling elements, handlers, and conditional branches survive the edit.
- Never skip tests after a change — even a "trivial" one. UI changes especially need explicit verification.
- If you notice unrelated brokenness, flag it; do not fix in the same PR.
- Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- Default to writing no comments. Only add when the **why** is non-obvious.
- Never introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10). Fix immediately if you notice.
- Do not take destructive git actions (force-push to main, hard-reset, amend published commits) without explicit user approval.
- Never commit secrets (.env, credentials). Warn if a user asks to.

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 2 — PROJECT CONVENTIONS. Edit freely. autonomous-review may append. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Project conventions

- **AGENTS.md is the primary cross-tool agent-context file.** CLAUDE.md @-imports AGENTS.md to avoid two parallel instruction sets. Per-workspace AGENTS.md files override at sub-folder scope. Keep root AGENTS.md under 200 lines; push detail into `docs/conventions/`.
- **ADRs in `docs/decisions/`** for any decision that crosses component boundaries, introduces a new external dependency, or chooses between non-obvious alternatives. Half a page is enough. Sequential numbering, format: Context / Decision / Consequences / Alternatives.
- **Two open standards are load-bearing.** Anything ACP- or MCP-related changes only with an ADR and confirmation from both contributors.
- **Branch-as-payload.** Roadmap status changes travel through the PR, never committed directly to main. Branch naming: `auto/<TASK-ID>-<slug>` for autonomous-cycle PRs; `<initials>/<slug>` for human PRs.
- **Two abstractions are sacred.** The `Sandbox` interface (packages/sandbox) and the `AcpHost` layer (packages/acp-host) exist so downstream choices stay reversible. Don't bypass them, don't leak Docker or Anthropic specifics into consumers, and require an ADR before changing their shape.
- **Secrets and OAuth tokens** are encrypted at rest via `packages/crypto`. Never log raw tokens. The master key (`PRAXIS_MASTER_KEY`) lives only in `.env` and the VPS systemd environment.
- **Idle shutdown is non-negotiable** for sandboxes (30 min default). Resource limits per project_plan.md §6 — don't relax without an ADR.

## Scaffolding hygiene

- **Gitignore new tooling artefacts in the same PR that introduces the tool.**
  When scaffolding a new dependency, audit what the tool writes to disk on
  first use and add those paths to `.gitignore` *before* opening the PR.
  Relevant for the Praxis stack:
  - **Next.js / Vite / Bun:** `.next/`, `.vite/`, `.turbo/`, `dist/`, `build/`, `*.tsbuildinfo`
  - **Drizzle / Kysely:** `drizzle/.snapshot/` only if you choose to keep generated migrations out of version control (default: commit them)
  - **Docker:** `.docker-build/` if you scaffold a local build cache directory
  - **Playwright:** `playwright-report/`, `test-results/`
  - **Vitest:** `coverage/`
  - **Editors:** `.idea/`, `.vscode/` (unless intentionally shared), `.DS_Store`

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 3 — TECH-COUPLED RULES. Evolves with the stack. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Testing patterns

- **Unit tests** with Vitest, colocated as `*.test.ts` next to the code they cover.
- **Integration tests** for `packages/sandbox` and `packages/acp-host` run against a real Docker daemon (gated by `RUN_DOCKER_TESTS=1` so CI without Docker still passes). The orchestrator-level integration tests run inside the CI job that has Docker available.
- **End-to-end tests** with Playwright in `apps/web/e2e/`. Smoke-level: sign in, create project, prompt and see a response.
- **No mocks of the database in tests that touch persistence.** Use an ephemeral Postgres via `docker-compose.dev.yml` or testcontainers.
- **No mocks of ACP.** The OSS ACP host fixture runs a real Claude Code subprocess with a recorded transcript for deterministic tests; full-stack tests use the real CLI.

## Architecture notes

- The Orchestrator owns active sessions. WebSocket hub, prompt queue, ACP communication, sandbox lifecycle — all in `services/orchestrator`. Postgres is the persistence layer, not the coordination layer.
- One WebSocket per user per project room. Server → client messages: `agent_event`, `partner_prompted`, `file_changed`, `git_state_updated`, `presence`, `sandbox_state`, `queue_position`, `error`.
- Each user's prompt is wrapped with an attribution header (invisible to the agent, recoverable from the transcript) before being sent over ACP. The ACP session is shared between users in the same project; the queue ensures one active turn at a time.
- Caddy serves three things on this VPS: `app.<domain>` → Next.js, `api.<domain>` → orchestrator (HTTP + /ws), and `*.preview.<domain>` → on-demand-allocated sandbox ports.
- Project state is captured to MinIO/R2 on sandbox stop and restored on the next start; sandboxes are otherwise ephemeral.

<!--
When either section above grows past ~10 multi-paragraph bullets, split
subsystem-specific rules into a **nested CLAUDE.md** placed under the
subsystem's directory (e.g. `services/orchestrator/CLAUDE.md`,
`packages/acp-host/CLAUDE.md`, `apps/web/CLAUDE.md`). Claude Code loads
nested CLAUDE.md files on demand when a file in or below that directory
is read (load_reason `nested_traversal`), so the root `CLAUDE.md` stays
thin and subsystem content only enters context when relevant.

Why nested CLAUDE.md and not `.claude/rules/` or `docs/notes/` with
`@-imports`:
- `@-imports` inside `.claude/rules/*.md` do NOT resolve — the import
  line is delivered as literal text, the referenced file never loads.
- `.claude/` paths are rejected by the Claude Code CLI's Edit tool
  under `--dangerously-skip-permissions`, so the autonomous cycle
  cannot refine anything stored there.
- Nested CLAUDE.md avoids both — loads automatically, lives outside
  `.claude/`, editable by the cycle.
-->


---

## Autonomous workflow

This project uses an autonomous development agent. Key facts:

- Tasks live in `roadmap/roadmap.yml`. Render with `node roadmap/render.mjs`.
- Branches follow `auto/<TASK-ID>-<slug>`.
- Roadmap status changes travel through the PR (branch-as-payload) — never committed directly to main.
- Every 5 consecutive successful tasks, the agent opens a self-improvement PR with auto-merge enabled. The PR is the audit trail; revert a bad refinement with `gh pr revert` (or `/autonomous-approve`, now a guided revert helper).
- CI required checks: `ci` (typecheck + lint + test + build). Optional: `e2e`.
- Auto-merge enabled on main; branch protection requires `ci`.

See `docs/RUNBOOK.md` for troubleshooting and `docs/ARCHITECTURE.md` for deeper
context on why the workflow is shaped this way.
