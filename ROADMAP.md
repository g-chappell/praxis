<!-- DO NOT EDIT — this file is generated from roadmap/roadmap.yml -->
<!-- To add tasks: edit roadmap/roadmap.yml, then run `node roadmap/render.mjs` -->
<!-- Or run /roadmap-add or /pm-brainstorm from Claude Code. -->

# Praxis — Roadmap

_Created: 2026-05-31_

## Summary

- **Features verified:** 9 / 24 (38%)
- **Total tasks:** 66
- **Done:** 31 (47%)
- **Ready:** 35
- **In progress:** 0
- **Blocked:** 0

---

## EPIC-01 — Foundations

Week 1 of the POC. Monorepo scaffold with agent-friendly documentation,
the Next.js frontend Dockerised on this VPS behind Caddy, the Postgres
schema and migrations, magic-link auth, and the orchestrator skeleton.
By the end: a deployed landing page, a signed-in dashboard, and a
reachable /health on the orchestrator.

- **STORY-01** — Monorepo scaffold with agent-friendly docs and CI  [:white_check_mark: verified]
  > Initialise the pnpm workspaces monorepo and write the cross-tool
  > documentation files that ground every later session — AGENTS.md
  > (root + scoped), CLAUDE.md as a thin importer, ARCHITECTURE.md,
  > and the ADR template. Set up Biome + tsc + vitest and a CI
  > workflow that runs them on every PR.
  **Acceptance criteria:**
  - Fresh clone → `pnpm i && pnpm test` exits 0 (no tests yet is acceptable; the runner must be wired).
  - AGENTS.md, CLAUDE.md, ARCHITECTURE.md, and docs/decisions/0000-template.md are committed at repo root.
  - GitHub Actions `ci` workflow passes on a no-op PR and is set as a required check.
  **Out of scope:**
  - Per-workspace AGENTS.md (added as each workspace lands).
  - Production CI hardening (caching, matrix builds) — basic runner is enough.
  - :white_check_mark: **TASK-001** — Initialise pnpm workspaces with apps/ services/ packages/ templates/ infrastructure/  `high` `small`
    > Add root package.json (private, pnpm workspaces), pnpm-workspace.yaml
    > listing apps/*, services/*, packages/*, templates/*, infrastructure/*,
    > tsconfig.base.json with strict TypeScript, Biome config, root .gitignore
    > additions for Node/Next/Vite/TS build artefacts.
    _Task AC:_
    - `pnpm -v` resolves to >=8 in the repo root after install.
    - .gitignore covers node_modules, .next, dist, .turbo, .vite, *.tsbuildinfo.
  - :white_check_mark: **TASK-002** — Write AGENTS.md, CLAUDE.md, ARCHITECTURE.md grounded in /docs  `high` `small`  
    _depends on: TASK-001_
    > Root AGENTS.md ≤200 lines: one-line description, build/test commands,
    > code style summary, architecture paragraph, never-dos. CLAUDE.md is
    > two lines that @-import AGENTS.md and docs/conventions/claude-code-specific.md.
    > ARCHITECTURE.md mirrors project_plan.md §2 (high-level shape + core principles).
    _Task AC:_
    - AGENTS.md exists with all sections referenced in project_plan.md §3.
    - CLAUDE.md @imports resolve to existing files.
  - :white_check_mark: **TASK-003** — Add CI workflow (Biome + tsc + vitest) and pull_request_template.md  `high` `small`  
    _depends on: TASK-001_
    > .github/workflows/ci.yml runs `pnpm install --frozen-lockfile`,
    > `pnpm lint`, `pnpm typecheck`, `pnpm test --run`. Under 2 minutes
    > on a clean cache. Add .github/pull_request_template.md summarising
    > context, scope, and AC link.
    _Task AC:_
    - CI passes on a PR that touches only docs.
    - `ci` is set as a required check via .github/branch-protection.sh.
  - :white_check_mark: **TASK-004** :checkered_flag: — ADR template and first two ADRs (deployment + template choice)  `med` `small`  
    _depends on: TASK-002_
    > docs/decisions/0000-template.md (Context/Decision/Consequences/Alternatives).
    > ADR-0001: POC deploys entirely to a single VPS via Caddy + Docker;
    > Cloudflare Pages deferred. ADR-0002: React + Three.js (drei + fiber)
    > chosen as the POC template over React/Phaser; reason: easier visual
    > output from the image-gen MCP via textures.
    _Task AC:_
    - Both ADRs are written and committed; status=Accepted.
    - STORY-01 acceptance_criteria all satisfied.

- **STORY-02** — Next.js frontend Dockerised and deployed to this VPS via Caddy  [:white_check_mark: verified]
  > Scaffold apps/web (Next.js 14 App Router, shadcn/ui, Tailwind).
  > Produce a Docker image, run it as a systemd-managed service on the
  > VPS, and reverse-proxy it through Caddy at app.<domain>. Wire a
  > GitHub Actions deploy job that rebuilds and reloads on merge to main.
  **Acceptance criteria:**
  - https://app.<domain> serves a landing page with project name and a Sign in button (HTTPS via Caddy).
  - Merge to main triggers a deploy job that rebuilds the image and `systemctl reload` runs without dropping connections.
  **User flow:**
  1. Visitor hits app.<domain>
  2. Landing page renders project name, short pitch, Sign in button
  3. Sign in routes to /signin (implemented in STORY-04)
  **Out of scope:**
  - Cloudflare Pages migration (post-POC, see ADR-0001).
  - CDN / edge caching.
  - :white_check_mark: **TASK-005** — Scaffold apps/web with Next.js 14, shadcn/ui, Tailwind  `high` `medium` _(apps/web)_  
    _depends on: TASK-001_
    > Use create-next-app (App Router, TypeScript, Tailwind). Install
    > shadcn/ui with sensible defaults (slate base). Build the landing
    > page with the project name, a one-paragraph pitch from docs/
    > executive_summary.md, and a Sign in CTA that links to /signin.
    _Task AC:_
    - `pnpm --filter web dev` serves the landing page locally.
    - Tailwind classes apply correctly (verified by snapshot or e2e).
  - :white_check_mark: **TASK-006** — Dockerise apps/web with Next.js standalone output  `high` `small` _(apps/web)_  
    _depends on: TASK-005_
    > Add apps/web/Dockerfile producing a slim runtime image (node:20-alpine,
    > standalone output). Multi-stage build. Expose port 3000.
    _Task AC:_
    - `docker build` succeeds and the resulting container responds to GET / with 200.
  - :white_check_mark: **TASK-007** — Caddyfile and systemd unit for the web container  `high` `small` _(infrastructure/caddy, infrastructure/deploy)_  
    _depends on: TASK-006_
    > infrastructure/caddy/Caddyfile with `app.<domain>` block reverse-proxying
    > to 127.0.0.1:3000. infrastructure/deploy/praxis-web.service systemd
    > unit running `docker run` for the web image with restart=on-failure.
    > Document the install-on-VPS steps in docs/runbooks/deploy-web.md.
    _Task AC:_
    - Both files lint clean (`caddy validate`, `systemd-analyze verify`).
  - :white_check_mark: **TASK-008** :checkered_flag: — GitHub Actions deploy job → SSH → docker pull → systemctl reload  `high` `medium` _(infrastructure/deploy)_  
    _depends on: TASK-007_
    > .github/workflows/deploy-web.yml: triggers on push to main when
    > apps/web/** changes. Builds the image, pushes to GHCR, SSHs to
    > the VPS using a deploy key, pulls, runs `systemctl reload
    > praxis-web.service`. Smoke-tests https://app.<domain>.
    _Task AC:_
    - Deploy job green on a PR that bumps the landing page copy.
    - STORY-02 acceptance_criteria satisfied end-to-end.

- **STORY-03** — Postgres schema and migrations (POC subset)  [:white_check_mark: verified]
  > Stand up Postgres locally via docker-compose and on the VPS via a
  > systemd-managed container. Apply the 12 POC tables (plus 1 supporting index) from
  > project_plan.md §9 via a migration runner, and codegen TypeScript
  > types into packages/db so the rest of the codebase consumes a
  > single source of truth.
  **Acceptance criteria:**
  - `pnpm db:migrate` against a fresh Postgres creates all 12 POC tables plus the 1 supporting index idempotently.
  - `pnpm db:codegen` regenerates packages/db/types from the live schema; CI fails if the generated file is stale.
  **Out of scope:**
  - Skills, portfolio, subscriptions, admin tables (post-POC).
  - Connection pooling / pgbouncer.
  - :white_check_mark: **TASK-009** — Local Postgres via docker-compose; production Postgres systemd unit on VPS  `high` `small` _(infrastructure/deploy)_
    > infrastructure/deploy/docker-compose.dev.yml runs Postgres 16 +
    > MinIO for local dev. infrastructure/deploy/praxis-postgres.service
    > runs a Postgres container on the VPS with a persistent volume
    > and daily pg_dump backups.
    _Task AC:_
    - `docker compose up postgres` brings up a database reachable on 5432.
  - :white_check_mark: **TASK-010** — Migration runner with the 12 POC tables (plus supporting index)  `high` `medium` _(packages/db)_  
    _depends on: TASK-001, TASK-009_
    > Pick drizzle-kit or kysely-codegen — write packages/db with the
    > schema verbatim from project_plan.md §9 (users, auth_sessions,
    > magic_link_tokens, oauth_tokens, teams, team_memberships,
    > team_invites, projects, sessions, events, agent_turns,
    > learning_links). Add `pnpm db:migrate`.
    _Task AC:_
    - All 12 tables and the supporting index from §9 exist after `db:migrate`.
    - Re-running `db:migrate` is a no-op.
  - :white_check_mark: **TASK-011** :checkered_flag: — Codegen TypeScript types and a CI check for drift  `med` `small` _(packages/db)_  
    _depends on: TASK-010_
    > `pnpm db:codegen` emits packages/db/types.ts from the live schema.
    > CI runs codegen and fails if `git diff --exit-code` reports
    > uncommitted changes.
    _Task AC:_
    - Types are consumed by apps/web and services/orchestrator without manual definition.
    - STORY-03 acceptance_criteria satisfied.

- **STORY-04** — Magic-link auth via Better Auth  [:white_check_mark: verified]
  > Users sign in by submitting an email; the platform mails a one-time
  > link; clicking it creates a session and redirects to /dashboard.
  > No password, no MFA. Email sender behind an interface so dev mode
  > can stub it and production uses Resend (or SMTP).
  **Acceptance criteria:**
  - Submitting an email at /signin produces a `magic_link_tokens` row and an email (real or stubbed); clicking the link issues a session cookie and lands on /dashboard.
  - Expired/invalid tokens reject with a 4xx and a clear error page.
  **User flow:**
  1. User opens /signin
  2. Types email, submits
  3. Sees 'Check your email' confirmation
  4. Clicks magic link in email
  5. Lands on /dashboard signed in
  **Out of scope:**
  - Email/password sign-up, MFA, OAuth-only sign-in (later phases).
  - Account deletion UI.
  - :white_check_mark: **TASK-012** — Wire Better Auth with the Postgres adapter and a magic-link plugin  `high` `medium` _(apps/web, packages/db)_  
    _depends on: TASK-005, TASK-011_
    > Install Better Auth in apps/web. Use the schema from STORY-03 for
    > users / auth_sessions / magic_link_tokens. Add the magic-link
    > plugin with a configurable mailer.
    _Task AC:_
    - Better Auth routes mounted under /api/auth and respond 2xx where expected.
  - :white_check_mark: **TASK-013** — Mailer interface + Resend prod / stub dev  `high` `small` _(apps/web)_  
    _depends on: TASK-012_
    > packages/mailer or apps/web/lib/mailer.ts exposing send(email,subject,html).
    > Prod implementation uses Resend (RESEND_API_KEY). Dev implementation
    > logs to stdout and writes to .mail/ for local inspection.
    _Task AC:_
    - Local sign-in surfaces the link in .mail/ when no Resend key is configured.
  - :white_check_mark: **TASK-014** :checkered_flag: — Sign-in pages and protected /dashboard  `high` `medium` _(apps/web)_  
    _depends on: TASK-012, TASK-013_
    > /signin (email form), /verify (handles magic link), /dashboard
    > (placeholder, shows user email and a Sign out button). Server-side
    > session middleware redirects unauthenticated requests to /signin.
    _Task AC:_
    - End-to-end Playwright test: submit email → fetch link from .mail/ → visit → land on /dashboard.
    - STORY-04 acceptance_criteria satisfied.

- **STORY-05** — Orchestrator skeleton — Bun + Hono + WebSocket hub  [:white_check_mark: verified]
  > Scaffold services/orchestrator as a Bun + Hono process. Expose
  > /health (used by deploy + uptime checks) and /ws (the WebSocket
  > hub that later carries agent events, presence, prompts). Run it
  > as a systemd-managed Bun process on the VPS, fronted by Caddy
  > at api.<domain> (HTTPS, /ws upgrades to WSS).
  **Acceptance criteria:**
  - GET https://api.<domain>/health returns `{ ok: true, version }` with status 200.
  - A WebSocket client can connect to wss://api.<domain>/ws, send `{type:'ping'}`, and receive `{type:'pong'}` within 1s.
  **Out of scope:**
  - Per-project rooms, prompt queue, ACP host (STORY-08 and later).
  - Authentication on /ws — added when sessions land in STORY-09.
  - :white_check_mark: **TASK-015** — Scaffold services/orchestrator with Bun + Hono + Dockerfile  `high` `small` _(services/orchestrator)_  
    _depends on: TASK-001_
    > Bun init + Hono dependency. Add Dockerfile (oven/bun:1 base).
    > tsconfig with strict settings extending tsconfig.base.json.
    _Task AC:_
    - `bun run dev` starts the server locally on :4000.
  - :white_check_mark: **TASK-016** — /health + /ws ping/pong with structured logging  `high` `small` _(services/orchestrator)_  
    _depends on: TASK-015_
    > Hono routes for GET /health. Bun.serve websocket handler for /ws.
    > Pino-style JSON logging via Bun's console + a small lib.
    _Task AC:_
    - Integration test connects a WebSocket, sends ping, asserts pong.
  - :white_check_mark: **TASK-017** :checkered_flag: — Caddy block for api.<domain> + systemd unit  `high` `small` _(infrastructure/caddy, infrastructure/deploy)_  
    _depends on: TASK-016, TASK-007_
    > Add `api.<domain>` block to the Caddyfile reverse-proxying to
    > 127.0.0.1:4000 (handles /ws upgrade). Add
    > praxis-orchestrator.service running the Bun container with
    > restart=on-failure.
    _Task AC:_
    - Public /health returns 200 after deploy.
    - STORY-05 acceptance_criteria satisfied.

## EPIC-02 — Agent integration

Week 2. Anthropic OAuth so users connect their own subscription, the
Sandbox abstraction with a Docker implementation, the ACP host that
speaks to Claude Code over JSON-RPC, and the first end-to-end
hello-world session that joins all three.

- **STORY-06** — Anthropic OAuth flow with encrypted token storage  [:white_check_mark: verified]
  > A signed-in user clicks "Connect to Claude Code" on /settings, completes
  > OAuth, and the platform stores access + refresh tokens encrypted
  > in oauth_tokens. On agent invocation, the orchestrator retrieves
  > the prompting user's token, refreshes if needed, and passes it
  > to Claude Code via environment.
  **Acceptance criteria:**
  - After connecting, a row exists in oauth_tokens with encrypted access/refresh tokens; decrypting yields valid tokens.
  - When the access token is within 60s of expiry, a refresh is performed automatically before any agent spawn.
  **User flow:**
  1. User goes to /settings
  2. Clicks 'Connect to Claude Code'
  3. Redirected to Anthropic OAuth
  4. Consents to scopes
  5. Redirected back to /settings showing 'Connected to Claude Code ✓'
  **Out of scope:**
  - OpenAI OAuth (next phase, alongside Codex).
  - Per-team token sharing.
  - :white_check_mark: **TASK-018** — Anthropic OAuth client + /api/oauth/anthropic/{authorize,callback}  `high` `medium` _(apps/web)_  
    _depends on: TASK-014_
    > Register a platform OAuth client with Anthropic (manual, captured
    > in docs/runbooks/anthropic-oauth.md). Implement state-cookie CSRF
    > protection, code exchange, and persistence into oauth_tokens.
    _Task AC:_
    - Round-trip from /settings → consent → /settings produces a row in oauth_tokens for the signed-in user.
  - :white_check_mark: **TASK-019** — Token encryption at rest  `high` `medium` _(packages/crypto, apps/web)_  
    _depends on: TASK-018_
    > packages/crypto: libsodium-based encrypt/decrypt using a 32-byte
    > key derived from PRAXIS_MASTER_KEY env. Document key rotation
    > in docs/runbooks/key-rotation.md.
    _Task AC:_
    - Round-trip encrypt → store → fetch → decrypt yields the original token.
  - :white_check_mark: **TASK-020** :checkered_flag: — Refresh-on-expiry + 'Connected to Anthropic' UI  `high` `small` _(apps/web, services/orchestrator)_  
    _depends on: TASK-019_
    > Shared helper: getValidAnthropicToken(userId) refreshes if
    > expires_at < now+60s. Settings page shows connection status,
    > with Disconnect action that nulls the row.
    _Task AC:_
    - Forcing expires_at into the past triggers a successful refresh before the next agent spawn.
    - STORY-06 acceptance_criteria satisfied.

- **STORY-07** — Sandbox interface + DockerSandbox implementation  [:white_check_mark: verified]
  > Define the Sandbox interface from project_plan.md §6 in
  > packages/sandbox so consumers depend on the abstraction, not on
  > Docker. Implement DockerSandbox via dockerode against a base
  > image with Node 20, Claude Code CLI, git, and common build tools.
  > Idle shutdown after 30 minutes; resource limits per §6.
  **Acceptance criteria:**
  - Integration tests cover start/exec/spawn/writeFile/readFile/watchFiles/exposePort/stop against a real Docker daemon and pass in CI.
  - After 30 minutes of no exec/spawn activity, the container is stopped automatically; the next start() restores from object storage (stubbed in tests).
  **Out of scope:**
  - E2B, Firecracker, Daytona implementations (later phases).
  - Per-template sandbox base images (handled in STORY-14).
  - :white_check_mark: **TASK-021** — packages/sandbox: define the Sandbox TypeScript interface  `high` `small` _(packages/sandbox)_  
    _depends on: TASK-001_
    > Copy the interface from project_plan.md §6 verbatim. Add
    > SandboxHandle, ExecOptions, ExecResult, SpawnOptions,
    > ProcessHandle, FileEvent, Unsubscribe types.
    _Task AC:_
    - Interface compiles with no `any`; exported from package index.
  - :white_check_mark: **TASK-022** — DockerSandbox via dockerode + base image  `high` `large` _(packages/sandbox, infrastructure/docker)_  
    _depends on: TASK-021_
    > infrastructure/docker/sandbox-base/Dockerfile based on node:20-bookworm
    > with claude-code CLI, git, build-essential, python3. DockerSandbox
    > class implements every method. Resource limits via HostConfig
    > (Memory 2g, CpuQuota for 1 CPU, StorageOpt 5g).
    _Task AC:_
    - All Sandbox methods have integration tests against the real Docker daemon and pass.
  - :white_check_mark: **TASK-023** :checkered_flag: — Idle-shutdown daemon + state persistence to MinIO  `high` `medium` _(packages/sandbox, services/orchestrator)_  
    _depends on: TASK-022_
    > Track last activity per sandbox; cron-style sweep every minute
    > stops idle ones. On stop, tar the project volume and PUT to
    > MinIO (bucket per project). On start with existing snapshot,
    > restore before returning the handle.
    _Task AC:_
    - End-to-end test: write file, force idle, observe stop, start, file is present.
    - STORY-07 acceptance_criteria satisfied.

- **STORY-08** — ACP host module in packages/acp-host  [:white_check_mark: verified]
  > Implement the ACP host code in packages/acp-host. Given a sandbox
  > handle and an Anthropic OAuth token, it spawns Claude Code inside
  > the sandbox, negotiates the ACP session over stdio, and exposes
  > prompt(text, attribution) returning an async iterator of
  > ACP events (text chunks, tool calls, file changes).
  **Acceptance criteria:**
  - Given a running sandbox and a valid token, prompt('hello') yields at least one text-chunk event and completes without error.
  - Tool-permission events surface to the caller for approval; denial cancels the turn cleanly.
  **Out of scope:**
  - Multi-user attribution (handled at the orchestrator layer in STORY-12).
  - Codex support (next phase).
  - :white_check_mark: **TASK-024** — Pick an OSS ACP client lib (or write a minimal one)  `high` `small` _(packages/acp-host)_  
    _depends on: TASK-001_
    > Evaluate published Node ACP libraries. Pick one or implement a
    > ~300-line JSON-RPC stdio client covering initialize, prompt,
    > session/update, request_permission, complete, shutdown.
    > Record the decision as ADR-0009.
    _Task AC:_
    - Choice recorded in docs/decisions/0009-*.md with Consequences and Alternatives.
  - :white_check_mark: **TASK-025** — AcpHost.spawnAndPrompt(sandbox, token, prompt) → AsyncIterable<AcpEvent>  `high` `large` _(packages/acp-host)_  
    _depends on: TASK-021, TASK-024_
    > Spawn `claude-code --acp` inside the sandbox via Sandbox.spawn.
    > Pipe stdin/stdout JSON-RPC. Emit typed events for each ACP
    > session/update kind. Forward request_permission to a callback.
    _Task AC:_
    - Unit tests cover happy-path prompt, tool-permission, and shutdown.
  - :white_check_mark: **TASK-026** :checkered_flag: — End-to-end integration test: prompt round-trip in a real sandbox  `high` `medium` _(packages/acp-host, packages/sandbox)_  
    _depends on: TASK-025, TASK-022_
    > CI job that starts a DockerSandbox, runs AcpHost.spawnAndPrompt
    > with a test token, and asserts a streamed text response within
    > 30s. Skipped on PRs that don't touch acp-host or sandbox.
    _Task AC:_
    - Integration test passes in CI on a clean build.
    - STORY-08 acceptance_criteria satisfied.

- **STORY-09** — End-to-end hello-world session
  > Tie it all together. A signed-in user creates a project, the
  > orchestrator starts a DockerSandbox, ACP host spins up Claude
  > Code, and the user's first prompt streams back to the browser
  > over WebSocket. On session stop, the project state captures to
  > MinIO; next session resume restores it.
  **Acceptance criteria:**
  - From a fresh dashboard: 'New project' → container starts → prompt 'say hello' → assistant response streams in chat panel within 10s.
  - Closing the session then re-opening the project restores file state (a marker file written during the first session is present in the second).
  **User flow:**
  1. Signed-in user on /dashboard
  2. Clicks 'New project'
  3. Picks the (single) react-threejs-scene template
  4. Lands on /projects/<id> with the three-panel workspace
  5. Types 'say hello' in the prompt panel
  6. Sees assistant response stream in the chat panel
  **Out of scope:**
  - Two-user simultaneous session (STORY-12).
  - Preview URL (STORY-13).
  - :black_circle: **TASK-027** — Orchestrator: createSession + WebSocket session room  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-017, TASK-023, TASK-025, TASK-058, TASK-059_
    > POST /sessions { projectId } creates a row in `sessions`, starts
    > a sandbox, spawns ACP, registers a WebSocket room. Clients in
    > the room receive agent_event messages broadcast from ACP.
    > Authenticates the agent with the active platform Anthropic API key
    > (getActivePlatformKey, STORY-21) passed as ANTHROPIC_API_KEY per
    > ADR-0009 — never an OAuth token. Hence the dependency on the admin
    > key management (STORY-20/21) landing first.
    _Task AC:_
    - Postman/integration test creates a session and receives at least one agent_event.
  - :black_circle: **TASK-028** — Frontend: New project flow + minimal chat panel  `high` `medium` _(apps/web)_  
    _depends on: TASK-014, TASK-027_
    > /dashboard 'New project' button → POST /projects → /projects/<id>
    > page that opens the WebSocket, sends prompts, renders streamed
    > agent events. No file tree / Monaco yet (that's STORY-10).
    _Task AC:_
    - Manual test: prompt 'say hello' streams a response in the chat panel.
  - :black_circle: **TASK-029** :checkered_flag: — State capture/restore via MinIO  `high` `medium` _(services/orchestrator, packages/sandbox)_  
    _depends on: TASK-027, TASK-023_
    > On session stop, tarball the project volume and PUT to MinIO
    > (bucket: praxis-project-state, key: <projectId>.tar.gz). On
    > next start, GET and untar before ACP spawn. Skip if no snapshot.
    _Task AC:_
    - Integration test: write marker file, stop session, restart, marker present.
    - STORY-09 acceptance_criteria satisfied.

- **STORY-19** — Sandbox outbound network egress allowlist
  > Restrict sandbox containers to an outbound allowlist (Anthropic API,
  > OpenAI API, npm, PyPI, GitHub read-only) with no inbound except the
  > exposed preview port, per project_plan.md §6. Deferred from STORY-07,
  > whose acceptance criteria covered the Sandbox interface, DockerSandbox,
  > and idle/persistence but not network policy.
  **Acceptance criteria:**
  - A sandbox container can reach api.anthropic.com and registry.npmjs.org but not an arbitrary disallowed host.
  - No inbound connections succeed except the port published via exposePort.
  **Out of scope:**
  - Per-user / per-template network policy (a single allowlist for the POC).
  - :black_circle: **TASK-053** :checkered_flag: — Egress allowlist for sandbox containers  `med` `medium` _(packages/sandbox, infrastructure/docker)_  
    _depends on: TASK-022_
    > Enforce an outbound allowlist on DockerSandbox containers (filtered
    > Docker network / egress proxy / firewall sidecar). Block all inbound
    > except the port published via exposePort. Document the policy and
    > how to extend the allowlist.
    _Task AC:_
    - Integration test: allowed host reachable, disallowed host blocked, from inside a sandbox.
    - STORY-19 acceptance_criteria satisfied.

## EPIC-03 — Workspace UI

Week 3. The collaborative three-panel surface: file tree + Monaco +
chat/prompt, real-time sync between two users with presence, cursors,
and file-level locks, a prompt queue with attribution, and preview
URLs surfaced through a wildcard Caddy domain.

- **STORY-10** — Three-panel workspace shell
  > The IDE-like layout users live in. Left: file tree from the
  > sandbox over WebSocket. Centre: Monaco loading whichever file
  > is clicked. Right: chat/prompt panel from STORY-09 expanded
  > with attribution and message types.
  **Acceptance criteria:**
  - Opening a project renders all three panels; the file tree mirrors the sandbox; clicking a file loads it in Monaco within 500ms.
  - Edits in Monaco persist to the sandbox over the WebSocket and reload correctly after a page refresh.
  **User flow:**
  1. User opens /projects/<id>
  2. Three panels render: file tree, editor, chat
  3. Clicks a file → contents load in Monaco
  4. Edits and saves → file persists in the sandbox
  **Out of scope:**
  - Yjs co-editing (post-POC).
  - Multi-cursor presence (STORY-11).
  - :black_circle: **TASK-030** — Workspace layout components + resizable panels  `high` `medium` _(apps/web)_  
    _depends on: TASK-028_
    > apps/web/components/Workspace with a 3-pane react-resizable-panels
    > layout. Persists pane sizes per-user in localStorage.
    _Task AC:_
    - Resizing a pane survives a page refresh.
  - :black_circle: **TASK-031** — File tree fed by sandbox watchFiles; Monaco loader  `high` `large` _(apps/web, services/orchestrator)_  
    _depends on: TASK-030, TASK-023_
    > Orchestrator forwards Sandbox.watchFiles events to the WebSocket
    > room as file_changed messages. Client builds a tree, requests
    > file contents via WS request, loads into Monaco. Save action
    > sends edit message → orchestrator writeFile → sandbox.
    _Task AC:_
    - Edit-save-refresh cycle preserves content.
  - :black_circle: **TASK-032** :checkered_flag: — Chat panel: typed message kinds + per-user attribution UI  `high` `small` _(apps/web)_  
    _depends on: TASK-030_
    > Render agent_event messages with kinds: text_chunk, tool_call,
    > file_change_notice, error. Each message shows the prompting
    > user's avatar+name. Prompt input shows the current user.
    _Task AC:_
    - Snapshot test of the chat panel rendering each message kind.
    - STORY-10 acceptance_criteria satisfied.

- **STORY-11** — Presence, cursors, and file-level locks
  > Two browsers in the same project see each other. Per-user cursors
  > show in Monaco when both users have the same file open. Opening
  > a file acquires a soft lock — the other user can see the file but
  > can't edit until the lock is released.
  **Acceptance criteria:**
  - Two browser sessions in the same project display each other in a presence list with avatar + name.
  - When user A opens file X, user B sees a lock indicator on file X and Monaco for X is read-only for B.
  **User flow:**
  1. User A and User B both open the same project
  2. Both see each other in the presence list
  3. User A clicks file X — file X is locked by A
  4. User B clicks file X — Monaco loads in read-only mode with 'Locked by A' header
  5. User A closes file X — lock releases, B's editor becomes editable
  **Out of scope:**
  - Character-level co-editing via Yjs (post-POC).
  - Follow mode (post-POC).
  - :black_circle: **TASK-033** — Presence + cursor messages and UI overlays  `high` `medium` _(apps/web, services/orchestrator)_  
    _depends on: TASK-031_
    > presence (join/leave/heartbeat) and cursor messages over WS.
    > Presence list in the workspace header; cursor overlays in
    > Monaco using monaco-editor decorations API.
    _Task AC:_
    - Two tabs in two windows see each other's cursor positions live.
  - :black_circle: **TASK-034** :checkered_flag: — File-lock acquire/release + read-only Monaco when locked  `high` `medium` _(apps/web, services/orchestrator)_  
    _depends on: TASK-033_
    > Orchestrator tracks file_locks per project room. file_lock
    > and file_unlock messages over WS. Client marks Monaco
    > read-only and shows lock owner in the file tree.
    _Task AC:_
    - Race test: simultaneous lock requests resolve deterministically (first writer wins).
    - STORY-11 acceptance_criteria satisfied.

- **STORY-12** — Prompt queue with two-user attribution
  > Both users in a project can submit prompts. Only one turn runs at
  > a time. Other prompts queue with visible position. The agent's
  > response is attributed to the user who prompted, in the chat
  > panel, in the agent_turns row, and in git commit metadata.
  **Acceptance criteria:**
  - If user A submits a prompt while user B's prompt is mid-turn, user A's prompt shows queue_position=1 until B's turn completes, then runs.
  - After completion, agent_turns row has prompting_user_id set; chat panel attributes the response to the prompter.
  **User flow:**
  1. User A submits 'do X' while User B is mid-turn
  2. User A sees 'queue position: 1' on their message
  3. User B's turn completes
  4. User A's prompt runs; response attributed to A
  **Out of scope:**
  - Cross-project queuing.
  - Priority levels / preemption.
  - :black_circle: **TASK-035** — Orchestrator FIFO queue per project + ACP attribution wrap  `high` `medium` _(services/orchestrator, packages/acp-host)_  
    _depends on: TASK-027_
    > Per-project queue of pending prompts. Each prompt wrapped with
    > an attribution header (invisible to the agent) before being
    > sent over ACP. agent_turns row created at enqueue, completed
    > after stream end.
    _Task AC:_
    - Integration test queues 3 prompts and confirms strict FIFO ordering.
  - :black_circle: **TASK-036** :checkered_flag: — Frontend: queue position UI + attribution in chat  `high` `small` _(apps/web)_  
    _depends on: TASK-035, TASK-032_
    > Show queue_position on the user's own pending message. When
    > a turn starts, swap to 'thinking…'. Chat messages show the
    > prompter's avatar + name.
    _Task AC:_
    - Manual two-browser test: A's prompt queues behind B's, runs after, both attributed correctly.
    - STORY-12 acceptance_criteria satisfied.

- **STORY-13** — Preview URL via Caddy wildcard
  > When a project's app starts (e.g. Vite on :5173 in the sandbox),
  > the orchestrator allocates a unique subdomain
  > <projectSlug>.preview.<domain> and registers it with Caddy
  > on-demand so it routes to the right sandbox port. URL is revoked
  > when the sandbox stops.
  **Acceptance criteria:**
  - Calling Sandbox.exposePort(handle, 5173) returns an https URL that fetches the sandbox's port content within 1s.
  - After Sandbox.stop(), the URL returns 502/404 (Caddy upstream gone).
  **Out of scope:**
  - Persistent preview URLs across sessions (Plus tier, productisation).
  - Custom user domains.
  - :black_circle: **TASK-037** — Caddy on-demand TLS for *.preview.<domain>  `high` `medium` _(infrastructure/caddy)_  
    _depends on: TASK-007, TASK-027_
    > Wildcard Caddy block with on_demand TLS and an ask endpoint
    > that the orchestrator answers (returns 200 iff the subdomain
    > maps to a live sandbox).
    _Task AC:_
    - Caddy validates and obtains a wildcard cert for the placeholder domain.
  - :black_circle: **TASK-038** :checkered_flag: — Sandbox.exposePort → Caddy upstream registration  `high` `medium` _(packages/sandbox, services/orchestrator)_  
    _depends on: TASK-037, TASK-022_
    > exposePort returns the URL after writing a mapping in an
    > orchestrator-local store. /caddy/ask reads the store. On
    > Sandbox.stop, mapping removed and Caddy reloaded (or just
    > dropped from the ask endpoint).
    _Task AC:_
    - Integration test: expose port serving 'hello', curl URL returns 'hello'; stop, curl returns 5xx.
    - STORY-13 acceptance_criteria satisfied.

## EPIC-04 — Template, git, polish

Week 4. The single POC template (React + Three.js + Vite),
image-generation MCP feeding textures, the git panel, agent
auto-commit guidance, curated learning links, and the dogfood pass
that closes the POC.

- **STORY-14** — React + Three.js + Vite template scaffold
  > templates/react-threejs-scene with Vite + React + TypeScript +
  > @react-three/fiber + drei. template.json declares preview port
  > 5173, harness claude-code, MCP servers [image-gen]. AGENTS.md
  > gives Claude Code Three.js conventions and texture-loading
  > patterns from public/textures/.
  **Acceptance criteria:**
  - Creating a project from `react-threejs-scene` lands the scaffold in the sandbox; `npm run dev` from inside the sandbox renders a starter cube scene visible in the preview URL.
  - Template AGENTS.md is loaded by Claude Code on its first turn (verified via the agent quoting one of its rules).
  **Out of scope:**
  - Additional templates (post-POC).
  - Asset pipelines for GLB/GLTF (later, if needed).
  - :black_circle: **TASK-039** — Scaffold templates/react-threejs-scene/  `high` `medium` _(templates/react-threejs-scene)_  
    _depends on: TASK-001_
    > Vite + React + TypeScript + @react-three/fiber + drei +
    > eslint + prettier. Starter scene with a rotating cube and a
    > skybox slot ready for an image-gen texture.
    _Task AC:_
    - Local `npm run dev` renders the starter cube on http://localhost:5173.
  - :black_circle: **TASK-040** — template.json + AGENTS.md + mcp-servers.json + sandbox.json  `high` `small` _(templates/react-threejs-scene)_  
    _depends on: TASK-039_
    > template.json matches §11 example with id react-threejs-scene.
    > AGENTS.md documents Three.js conventions, texture loading from
    > /public/textures, image-gen usage rules. mcp-servers.json
    > enables image-gen. sandbox.json sets base image and port 5173.
    _Task AC:_
    - Schema validation for template.json passes against the (yet-to-be-written) validator.
  - :black_circle: **TASK-041** :checkered_flag: — End-to-end: create project from template, see preview URL render  `high` `medium` _(services/orchestrator, apps/web)_  
    _depends on: TASK-040, TASK-038, TASK-029_
    > POST /projects with template_id=react-threejs-scene copies
    > scaffold into the sandbox, runs `npm install`, exposes port
    > 5173, returns the preview URL. UI shows preview iframe.
    _Task AC:_
    - End-to-end Playwright test creates a project and asserts the preview iframe renders the cube.
    - STORY-14 acceptance_criteria satisfied.

- **STORY-15** — Image-generation MCP server (textures for Three.js)
  > infrastructure/mcp-servers/image-gen exposes a `generate_image`
  > tool backed by the OpenAI Image API. Claude Code discovers it
  > via the template's mcp-servers.json and calls it for texture
  > generation; outputs land in /public/textures/ and become
  > loadable in the running scene.
  **Acceptance criteria:**
  - Claude Code in a react-threejs-scene project, prompted to add a stone texture, calls `generate_image` and writes a PNG into /public/textures/; the scene loads it within the same turn.
  - Per-project per-day usage cap is enforced (default 50 calls); the 51st call returns an error response from the MCP server.
  **Out of scope:**
  - Multi-provider image generation (later).
  - Image editing / inpainting (later).
  - :black_circle: **TASK-042** — infrastructure/mcp-servers/image-gen MCP server  `high` `large` _(infrastructure/mcp-servers)_  
    _depends on: TASK-001_
    > MCP server (stdio) implementing tools/list + tools/call for
    > generate_image. Args: prompt, width, height, save_path. Uses
    > OPENAI_API_KEY from the sandbox env; defaults save_path to
    > /workspace/public/textures/<slug>.png.
    _Task AC:_
    - Standalone test against the MCP server returns a PNG file on disk.
  - :black_circle: **TASK-043** — Per-project usage cap  `high` `small` _(infrastructure/mcp-servers, services/orchestrator)_  
    _depends on: TASK-042_
    > Counter stored in Postgres (events table or a small `mcp_usage`
    > table). MCP server reads PROJECT_ID + cap from env on startup
    > and rejects with an explicit error after the cap is hit.
    _Task AC:_
    - Integration test crosses the cap and observes a clean refusal.
  - :black_circle: **TASK-044** :checkered_flag: — Wire MCP server into the react-threejs-scene sandbox  `high` `medium` _(templates/react-threejs-scene, packages/sandbox)_  
    _depends on: TASK-042, TASK-040, TASK-022_
    > DockerSandbox reads mcp-servers.json from the template and
    > co-spawns each MCP server as a sidecar inside the sandbox,
    > configuring Claude Code's MCP config to point at it.
    _Task AC:_
    - End-to-end: Claude Code is asked to add a stone texture; sees it appear in the preview.
    - STORY-15 acceptance_criteria satisfied.

- **STORY-16** — Git panel — branch, log, diff, revert
  > A panel in the workspace shows the project's current branch,
  > recent commits with author + message + timestamp, working tree
  > status, and per-file diffs in Monaco's diff editor. Revert
  > rewinds the working tree to a chosen commit with a confirm step.
  **Acceptance criteria:**
  - After at least one auto-commit, the git panel lists it with author = prompting user and the commit message the agent wrote.
  - Revert to a chosen commit restores the working tree; subsequent diff view confirms the change.
  **User flow:**
  1. User opens git panel
  2. Sees current branch + last 20 commits
  3. Clicks a commit → diff renders in Monaco diff mode
  4. Clicks Revert → confirmation modal → working tree resets
  **Out of scope:**
  - Branches / merges UI (later).
  - Pushing to a remote (later).
  - :black_circle: **TASK-045** — Orchestrator: git data API (branch, log, status, diff)  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-029_
    > GET /projects/<id>/git/{branch,log,status} and
    > /git/diff?from=<sha>&to=<sha>. Backed by Sandbox.exec running
    > git commands in the project directory.
    _Task AC:_
    - All four endpoints return structured JSON; integration tests pass.
  - :black_circle: **TASK-046** :checkered_flag: — Frontend: GitPanel component + revert with confirmation  `high` `medium` _(apps/web)_  
    _depends on: TASK-045, TASK-030_
    > GitPanel mounts in workspace right rail. Log list, file diff
    > via Monaco diff editor, Revert action with a 'Type the commit
    > SHA to confirm' modal.
    _Task AC:_
    - Manual test: revert a known commit, working tree state matches.
    - STORY-16 acceptance_criteria satisfied.

- **STORY-17** — Agent auto-commit policy + curated learning links
  > The agent's system prompt and the template AGENTS.md guide
  > Claude Code to commit at meaningful stages with imperative-mood
  > messages, attributed to the prompting user via git author. The
  > learning_links table is seeded with curated entries from
  > Anthropic Cookbook, OpenAI Codex docs, git tutorials, and
  > agentic-prompting guides; the workspace surfaces them.
  **Acceptance criteria:**
  - After completing one of the dogfood tasks in STORY-18, the project has ≥3 git commits with imperative messages and the prompting user as author.
  - learning_links has ≥10 entries spanning ACP, MCP, Three.js, git, and agentic-prompting topics; the workspace learning panel renders them grouped by topic.
  **User flow:**
  1. Agent finishes a coherent unit of work
  2. Agent runs `git add` and `git commit -m '<imperative message>'`
  3. Commit appears in the git panel attributed to the prompter
  4. User opens learning panel and sees topic-grouped links
  **Out of scope:**
  - In-house authored learning content (post-POC).
  - Progress tracking on link interactions (post-POC).
  - :black_circle: **TASK-047** — Auto-commit guidance in template AGENTS.md + a /commit skill  `high` `small` _(templates/react-threejs-scene)_  
    _depends on: TASK-040_
    > AGENTS.md section: when to commit (task complete; before
    > destructive op; on user ask) and how (imperative mood,
    > concise, references task). Add a small skill under
    > .claude/skills/commit-checkpoint/SKILL.md.
    _Task AC:_
    - Agent in a dogfood session commits at the expected moments without explicit prompting.
  - :black_circle: **TASK-048** — Seed learning_links with ≥10 curated entries  `med` `small` _(packages/db, apps/web)_  
    _depends on: TASK-011_
    > Seed file in packages/db/seeds/learning-links.ts. Entries
    > cover ACP overview, MCP overview, Three.js + drei,
    > react-three-fiber patterns, OpenAI image API, git basics,
    > agentic prompting (Anthropic), Cookbook samples, Caddy
    > on-demand TLS, Better Auth.
    _Task AC:_
    - Seed runs idempotently; SELECT COUNT(*) FROM learning_links ≥10.
  - :black_circle: **TASK-049** :checkered_flag: — Workspace learning panel grouped by topic  `med` `small` _(apps/web)_  
    _depends on: TASK-048, TASK-032_
    > Collapsible panel near the chat panel grouping links by topic
    > tag. Cards: title + source. External links open in a new tab.
    _Task AC:_
    - Snapshot test of the panel rendering grouped links.
    - STORY-17 acceptance_criteria satisfied.

- **STORY-18** — Internal dogfood + first university pair
  > Validate the POC by using it. Founders pair to build a small
  > Three.js game end-to-end inside the platform, capturing friction.
  > Then onboard one external pair of university students, observe a
  > session, file bugs, and write a short retro to close the POC.
  **Acceptance criteria:**
  - Founders complete a small Three.js game end-to-end inside the platform without manual workarounds.
  - One external pair completes a session; ≥5 issues filed; a retro doc is committed under docs/retros/.
  **User flow:**
  1. Founders open a project, prompt the agent to build a small game
  2. Iterate to a playable build, deploy to preview URL
  3. Onboard external pair for a 60-minute session
  4. Observe; file issues; write retro
  **Out of scope:**
  - Bug fixes from the dogfood session (folded into post-POC backlog).
  - :black_circle: **TASK-050** — Founders' dogfood pass and friction log  `high` `large`  
    _depends on: TASK-049, TASK-046, TASK-044, TASK-041_
    > Founders pair for one or two sessions building a small
    > Three.js game (e.g. ball-rolling, simple collector). Log
    > friction in docs/retros/dogfood-friction.md as it happens.
    _Task AC:_
    - Friction log file exists with ≥10 entries.
  - :black_circle: **TASK-051** — External pair session + bug filing  `high` `medium`  
    _depends on: TASK-050_
    > Recruit one pair (university). Observe a 60-minute session.
    > File each surfaced issue as a GitHub issue with steps to
    > reproduce.
    _Task AC:_
    - ≥5 GitHub issues filed and labelled `from:user-test-1`.
  - :black_circle: **TASK-052** :checkered_flag: — POC retro doc  `high` `small`  
    _depends on: TASK-051_
    > docs/retros/2026-XX-poc-close.md: what worked, what broke,
    > what's next, signal vs noise from the external pair. Closes
    > the POC milestone.
    _Task AC:_
    - Retro doc committed.
    - STORY-18 acceptance_criteria satisfied.

## EPIC-05 — Platform operations & admin

Operational capabilities the platform-owned-key model (ADR-0009) requires.
The POC pivoted from per-user subscription OAuth to a platform-owned
Anthropic API key billed under the Commercial Terms — hosted multiplayer
cannot run on a personal subscription. That introduces obligations the
earlier epics don't cover: an authenticated admin area, the platform API
key's lifecycle (encrypted at rest, rotation), and per-project usage
metering with budget enforcement so real spend stays bounded. This epic is
also the foundation future admin capabilities (user management, feature
flags, observability) mount into.

- **STORY-20** — Admin area shell with role-based access  [:white_check_mark: verified]
  > An admin-only section in apps/web, gated by a role on the users table
  > (seeded for the two contributors). Navigation, layout, and the
  > authorization boundary that later admin features (API keys, usage,
  > budgets) mount into. Establishes "who is an admin" once, in Postgres.
  **Acceptance criteria:**
  - A non-admin who navigates to /admin is denied (redirect or 403); an admin sees the admin dashboard.
  - The two contributor accounts are admins via a seeded role persisted in Postgres; role survives a fresh migrate+seed.
  **User flow:**
  1. Admin signs in and opens /admin
  2. Admin dashboard lists available sections (API keys, usage) with empty states for the not-yet-built ones
  3. Non-admin hitting /admin is bounced to /dashboard
  **Out of scope:**
  - The individual admin features themselves (keys: STORY-21; usage: STORY-22/23).
  - Multi-role hierarchies / fine-grained permissions beyond admin vs not.
  - :white_check_mark: **TASK-054** — Add a role to the users schema + migration + seed the two contributors as admin  `high` `small` _(packages/db)_  
    _depends on: TASK-011_
    > Add a `role` column (enum: 'user' | 'admin', default 'user') to the
    > users table in packages/db schema; generate the migration and run
    > codegen. Seed the two contributor accounts as 'admin' via an
    > idempotent seed/migration so a fresh VPS rebuild reproduces it.
    _Task AC:_
    - users.role exists with a migration; pnpm db:codegen is clean.
    - A seed marks the two contributor emails as admin idempotently.
  - :white_check_mark: **TASK-055** — /admin route group with role-gated middleware and layout shell  `high` `medium` _(apps/web)_  
    _depends on: TASK-054, TASK-014_
    > Add an /admin route group with a server-side authorization check
    > (admin role required) reusing the Better Auth session. Provide the
    > admin layout + nav shell. Non-admins are redirected; unauthenticated
    > users hit the sign-in flow.
    _Task AC:_
    - Middleware/route guard denies non-admins and allows admins (covered by a test).
  - :white_check_mark: **TASK-056** :checkered_flag: — Admin dashboard landing with sections index  `med` `small` _(apps/web)_  
    _depends on: TASK-055_
    > The /admin landing page: a sections index linking to API keys and
    > usage, with clear empty states for sections that land in later
    > stories. No mock data — real links, real empty states.
    _Task AC:_
    - Admin dashboard renders the sections index for an admin.
    - STORY-20 acceptance_criteria satisfied.

- **STORY-21** — Platform Anthropic API key management (encrypted, rotation)
  > Admin UI + storage for the platform Anthropic API key that powers all
  > agent sessions (ADR-0009). The key is pasted once, encrypted at rest
  > with @praxis/crypto (same posture as oauth_tokens), and never returned
  > in plaintext or logged afterwards — reads show a masked value plus
  > metadata only. Single active key with rotation: rotating replaces the
  > active key and retains the previous one encrypted, inactive, for audit.
  > A server-side accessor returns the decrypted active key to the
  > orchestrator at agent-spawn time (consumed by AcpHost; wired in the
  > orchestrator under STORY-09).
  **Acceptance criteria:**
  - An admin can paste an API key; it is stored encrypted (never plaintext, never logged) and no read path returns the raw value — masked display + metadata only.
  - Rotating sets a new active key and marks the prior key inactive but retained (encrypted) for audit; new sessions use the active key.
  - getActivePlatformKey() returns the decrypted active key server-side, or fails loudly when none is set.
  **User flow:**
  1. Admin opens /admin → API keys
  2. Admin pastes the platform key and saves; UI then shows only a masked key + created/rotated metadata
  3. Admin rotates: pastes a new key; the old one is retained inactive for audit
  **Out of scope:**
  - Multiple concurrent keys / per-project keys (single active key by ADR-0009).
  - Automated rotation, Stripe/billing integration.
  - The orchestrator's spawn-time consumption (STORY-09 wiring; this story only provides the accessor).
  - :white_check_mark: **TASK-057** — platform_api_keys table (encrypted value, active flag, audit columns) + migration  `high` `small` _(packages/db)_  
    _depends on: TASK-011, TASK-019_
    > Schema for platform_api_keys: encrypted key material (via
    > @praxis/crypto), an active flag, created_by, created_at,
    > last_rotated_at. Migration + codegen. Never store plaintext.
    _Task AC:_
    - Table + migration exist; codegen clean; the key column holds ciphertext only.
  - :white_check_mark: **TASK-058** — Key service: set / rotate / deactivate + getActivePlatformKey() accessor  `high` `medium` _(packages/db, apps/web)_  
    _depends on: TASK-057_
    > Service that encrypts on write and decrypts on read via
    > @praxis/crypto: setActivePlatformKey(raw), rotate (new active, old
    > retained inactive), and getActivePlatformKey() returning the
    > decrypted active key for server-side consumers (the orchestrator).
    > Loud-fail when no active key is configured. Never log raw values.
    _Task AC:_
    - Unit tests cover set, rotate (old marked inactive), and the no-key loud-fail; no test logs a raw key.
  - :black_circle: **TASK-059** :checkered_flag: — Admin UI: paste key, masked display + metadata, rotate  `high` `medium` _(apps/web)_  
    _depends on: TASK-058, TASK-055_
    > Admin → API keys page: paste-and-save, then a masked-only display
    > with created/rotated metadata and a rotate action. No endpoint
    > echoes the raw key back. Clear empty state + loud banner when no
    > active key is set.
    _Task AC:_
    - An admin can set and rotate the key through the UI; the raw value is never re-displayed.
    - STORY-21 acceptance_criteria satisfied.

- **STORY-22** — Per-project usage metering (record + display)
  > Persist the token usage emitted on each AcpEvent turn-complete
  > (ADR-0009), attributed to project and session, and surface cumulative
  > usage (with a cost estimate) to the project owner. The data foundation
  > for budget enforcement (STORY-23) and any later billing.
  **Acceptance criteria:**
  - Each completed turn records input/output token usage attributed to its project and session in Postgres.
  - A project owner sees cumulative usage and a cost estimate for their project.
  **Out of scope:**
  - Budget caps / enforcement (STORY-23).
  - Invoicing or payment integration (post-POC).
  - :black_circle: **TASK-060** — usage_events table (project, session, tokens, cost estimate) + migration  `med` `small` _(packages/db)_  
    _depends on: TASK-011_
    > Schema for per-turn usage: project_id, session_id, input_tokens,
    > output_tokens, estimated_cost, created_at. Migration + codegen.
    _Task AC:_
    - Table + migration exist; codegen clean.
  - :black_circle: **TASK-061** — Orchestrator records usage from turn-complete events  `med` `medium` _(services/orchestrator)_  
    _depends on: TASK-060, TASK-025, TASK-027_
    > In the session loop, persist a usage_events row from each AcpEvent
    > of type turn-complete (the usage payload AcpHost surfaces), keyed by
    > project + session.
    _Task AC:_
    - An integration/unit test shows a completed turn writes a usage row with the reported tokens.
  - :black_circle: **TASK-062** :checkered_flag: — Owner usage view (cumulative tokens + cost estimate)  `med` `medium` _(apps/web)_  
    _depends on: TASK-061_
    > Project-scoped usage view for the owner: cumulative input/output
    > tokens and an estimated cost, sourced from usage_events. Real data,
    > no placeholders.
    _Task AC:_
    - Owner sees real cumulative usage + cost estimate for a project.
    - STORY-22 acceptance_criteria satisfied.

- **STORY-23** — Per-project budget caps that pause sessions
  > Bound real spend: a configurable per-project budget that, when
  > exceeded, pauses the project — new prompts are blocked with a clear
  > message until the budget is raised (by the owner or an admin). Builds
  > on usage metering (STORY-22) and the platform-key model (ADR-0009).
  **Acceptance criteria:**
  - A project has a configurable budget; when cumulative usage exceeds it, new prompts are blocked with a clear, actionable message.
  - Raising the budget (owner or admin) resumes prompting without losing session context.
  **Out of scope:**
  - Invoicing / payment (Stripe) — a later epic.
  - Org-level or cross-project pooled budgets.
  - :black_circle: **TASK-063** — Project budget configuration (limit) + owner/admin setting  `med` `small` _(packages/db, apps/web)_  
    _depends on: TASK-060, TASK-055_
    > Add a per-project budget limit (schema + migration) and a setting
    > UI for the owner (and admin override). Sensible default.
    _Task AC:_
    - A project budget can be set and read; migration + codegen clean.
  - :black_circle: **TASK-064** :checkered_flag: — Enforce budget: block prompts over budget, resume on raise  `med` `large` _(services/orchestrator, apps/web)_  
    _depends on: TASK-063, TASK-061, TASK-028_
    > Before accepting a prompt, compare cumulative usage to the budget;
    > when over, reject/pause with a clear message surfaced in the chat
    > UI and allow resume once the budget is raised. No silent drops.
    _Task AC:_
    - Over-budget prompts are blocked with a clear message; raising the budget resumes prompting.
    - STORY-23 acceptance_criteria satisfied.

- **STORY-24** — Reconcile Anthropic OAuth with the platform-key model
  > Under ADR-0009 the platform API key powers inference; the per-user
  > Anthropic OAuth flow (STORY-06) is no longer used for it. Make that
  > explicit without discarding working code: ensure no code path passes a
  > per-user OAuth token to the agent, mark the "Connected to Anthropic" UI
  > as not-used-for-inference (or hide it behind a flag), and document the
  > credential as reserved for future identity / bring-your-own-key. Do not
  > modify oauth_tokens or @praxis/crypto.
  **Acceptance criteria:**
  - The agent-spawn path uses the platform API key exclusively; no code path forwards a per-user OAuth token to the agent.
  - The Settings 'Connected to Anthropic' UI reflects reality (hidden or clearly marked 'not used for inference under the current plan'), with a note in docs.
  **Out of scope:**
  - Deleting the OAuth flow or the oauth_tokens table.
  - Building the bring-your-own-key tier.
  - :black_circle: **TASK-065** — Ensure the platform key is the sole inference credential  `low` `small` _(services/orchestrator)_  
    _depends on: TASK-058, TASK-027_
    > Audit the spawn path: confirm only ANTHROPIC_API_KEY (platform key)
    > reaches the agent and no CLAUDE_CODE_OAUTH_TOKEN / per-user OAuth
    > token is forwarded. Add a guard/test.
    _Task AC:_
    - A test asserts the agent env carries the platform key and no per-user OAuth token.
  - :black_circle: **TASK-066** :checkered_flag: — Settings UI + docs reflect OAuth's not-used-for-inference status  `low` `small` _(apps/web)_  
    _depends on: TASK-065, TASK-020_
    > Update the 'Connected to Anthropic' Settings UI to state it is not
    > used for inference under the current plan (or hide behind a flag),
    > and note the reserved-for-future role in docs. Leave oauth_tokens
    > and @praxis/crypto untouched.
    _Task AC:_
    - Settings UI no longer implies OAuth powers sessions; docs note the reserved role.
    - STORY-24 acceptance_criteria satisfied.
