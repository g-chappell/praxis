# ARCHITECTURE.md — Praxis

System shape for the POC. Mirrors `docs/project_plan.md` §2 with the
divergences from STORY-01 already incorporated (single-VPS deploy, no
Cloudflare Pages — see ADR-0001).

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

All three boxes — `apps/web`, the orchestrator, the per-project sandbox
containers, and Postgres — live on the same VPS for the POC. Caddy
terminates TLS and routes by hostname:

- `app.<domain>` → `apps/web` (Next.js)
- `api.<domain>` → orchestrator (HTTP + `/ws` WebSocket upgrade)
- `*.preview.<domain>` → on-demand-allocated sandbox ports

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

| Subsystem | Workspace | Status (post-STORY-01) |
|---|---|---|
| Frontend | `apps/web` | scaffolded in STORY-02 |
| Orchestrator | `services/orchestrator` | scaffolded in STORY-05 |
| Postgres schema + types | `packages/db` | STORY-03 |
| Sandbox interface + `DockerSandbox` | `packages/sandbox` | STORY-07 |
| ACP host module | `packages/acp-host` | STORY-08 |
| OAuth token encryption | `packages/crypto` | STORY-06 |
| Shared types | `packages/shared` | as needed |
| POC template | `templates/react-threejs-scene` | STORY-14 |
| Reverse proxy config | `infrastructure/caddy` | STORY-02 / STORY-13 |
| Sandbox base image | `infrastructure/docker` | STORY-07 |
| systemd units + deploy scripts | `infrastructure/deploy` | STORY-02 / STORY-05 |
| MCP servers (image-gen) | `infrastructure/mcp-servers` | STORY-15 |

## Read further

- `docs/project_plan.md` — full engineering spec, data model, week-by-week
  POC roadmap, deferred work.
- `docs/executive_summary.md` — product context: who Praxis is for, what
  the six pillars are, what's in the POC vs the post-POC phase.
- `docs/development_strategy.md` — two-person async working agreement.
- `docs/decisions/` — ADRs. Read these before changing anything that an
  ADR touches; supersede via a new ADR rather than silent change.
- `AGENTS.md` — agent-context: rules, conventions, key commands.
