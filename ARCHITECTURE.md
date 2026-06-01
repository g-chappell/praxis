# ARCHITECTURE.md — Praxis

System shape for the POC. Mirrors `docs/project_plan.md` §2 with the
divergences from STORY-01 already incorporated (single-VPS deploy, no
Cloudflare Pages — see ADR-0001) and EPIC-01 deployment realities
reflected throughout (multi-tenant VPS via Caddy — ADR-0004; Better
Auth schema hybrid — ADR-0005).

## High-level shape

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (User A)                    Browser (User B)            │
│  ┌──────────────────┐                ┌──────────────────┐        │
│  │ Next.js frontend │                │ Next.js frontend │        │
│  │ (apps/web)       │                │                  │        │
│  └────────┬─────────┘                └────────┬─────────┘        │
└───────────┼────────────────────────────────────┼─────────────────┘
            │ WebSocket + HTTP (via Caddy TLS)   │
            └──────────────┬─────────────────────┘
                           ▼
          ┌──────────────────────────────────────────┐
          │  Orchestrator (Bun + Hono on VPS)        │
          │  - WebSocket hub (rooms per project)     │
          │  - Prompt queue + attribution            │
          │  - ACP host implementation               │
          │  - Sandbox lifecycle                     │
          │  - Event log writer                      │
          └─────────┬──────────────────┬─────────────┘
                    │                  │
                    ▼                  ▼
       ┌─────────────────────┐  ┌──────────────────────┐
       │ Docker container    │  │ Postgres 16          │
       │ per project (VPS)   │  │                      │
       │                     │  │ - users              │
       │ + Claude Code CLI   │  │ - teams              │
       │   speaking ACP      │  │ - projects           │
       │ + project files     │  │ - sessions           │
       │ + .git/             │  │ - events             │
       │ + MCP server(s)     │  │ - oauth_tokens       │
       │ + preview port      │  │ - learning_links     │
       └─────────────────────┘  └──────────────────────┘
```

All four boxes — `apps/web`, the orchestrator, the per-project sandbox
containers, and Postgres — live on the same VPS for the POC. Caddy
terminates TLS and routes by hostname:

- `praxis.<domain>` → `apps/web` (Next.js, port `:3002`)
- `api.<domain>` → orchestrator (HTTP + `/ws` WebSocket upgrade, port `:4001`)
- `*.preview.<domain>` → on-demand-allocated sandbox ports (future, STORY-07+)

## Current deployment (post-EPIC-01)

What's actually live on the VPS today. Everything below is a Docker
container on the shared `praxis-net` bridge, managed by systemd, and
sharing `/etc/praxis/praxis.env`.

| Container | Image | Public URL | Story | Status |
|---|---|---|---|---|
| `praxis-web` | `ghcr.io/g-chappell/praxis-web:latest` | `https://praxis.blacksail.dev` | STORY-02 / 04 | Live — sign-in works end to end |
| `praxis-orchestrator` | `ghcr.io/g-chappell/praxis-orchestrator:latest` | `https://api.praxis.blacksail.dev` | STORY-05 | Live — `/health` + `/ws` ping/pong |
| `praxis-db` | `postgres:16-alpine` | (internal, bound `127.0.0.1:5432`) | STORY-03 | Live — schema migrated, Better Auth tables present |

Caddy at `:80`+`:443` serves the composite (Praxis + other VPS
tenants — see ADR-0004). TLS via Caddy's built-in ACME.

Mail goes out via Resend (apex `praxis.blacksail.dev`, see ADR-0005
addendum and `docs/conventions/auth-and-mail.md`). Sign-in is magic
link, no password storage.

## Core principles

- **Orchestrator owns active sessions.** WebSocket hub, prompt queue, ACP
  communication, sandbox lifecycle. Postgres is the persistence layer, not
  the coordination layer.
- **Agents speak ACP.** Claude Code and (in the next phase) Codex CLI both
  implement ACP natively. The orchestrator is an ACP host; communication is
  standard JSON-RPC over stdio. See `docs/project_plan.md` §4.
- **Sandboxes are Docker containers on a VPS for the POC.** The `Sandbox`
  interface in `packages/sandbox` is abstract; E2B, Firecracker, or Daytona
  implementations slot in later without touching consumers.
- **Real-time uses one transport.** Single WebSocket per user to the
  orchestrator. The orchestrator broadcasts to all members of a project room.
- **OAuth credentials per user.** Each user OAuth-links their Anthropic
  account (Codex via OpenAI in the next phase). When the agent is invoked,
  the prompting user's credentials are passed to the Claude Code subprocess
  via environment variable.

## Where each subsystem lives in the repo

| Subsystem | Workspace | Status (post-EPIC-01) |
|---|---|---|
| Frontend (landing, dashboard, auth) | `apps/web` | **Live** — STORY-02, STORY-04 |
| Orchestrator (HTTP + WS) | `services/orchestrator` | **Live** — STORY-05 |
| Postgres schema + Drizzle client | `packages/db` | **Live** — STORY-03 |
| Sandbox interface + `DockerSandbox` | `packages/sandbox` | Future — STORY-07 |
| ACP host module | `packages/acp-host` | Future — STORY-08 |
| OAuth token encryption | `packages/crypto` | Future — STORY-06 |
| Shared types | `packages/shared` | as needed |
| POC template | `templates/react-threejs-scene` | Future — STORY-14 |
| Reverse proxy config | `infrastructure/caddy` | **Live** — STORY-02 / STORY-05 |
| Sandbox base image | `infrastructure/docker` | Future — STORY-07 |
| systemd units + deploy scripts | `infrastructure/deploy` | **Live** — STORY-02 / STORY-03 / STORY-05 |
| MCP servers (image-gen) | `infrastructure/mcp-servers` | Future — STORY-15 |

## Read further

- `AGENTS.md` — agent-context: tier-1 universal rules, tier-2 project
  conventions, tier-3 tech-coupled rules + cross-cutting cookbook
  pointers.
- `docs/conventions/` — topic cookbooks split out of AGENTS.md tier-3:
  `deploy.md`, `database.md`, `auth-and-mail.md`.
- `docs/runbooks/` — per-deployable ops procedures: `deploy-web.md`,
  `deploy-postgres.md`, `deploy-orchestrator.md`.
- `docs/decisions/` — ADRs. Read these before changing anything an
  ADR touches; supersede via a new ADR rather than silent change.
- `docs/project_plan.md` — full engineering spec, data model,
  week-by-week POC roadmap, deferred work.
- `docs/executive_summary.md` — product context: who Praxis is for,
  what the six pillars are, what's in the POC vs the post-POC phase.
- `docs/development_strategy.md` — two-person async working agreement.
