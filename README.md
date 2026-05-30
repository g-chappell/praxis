# Praxis

A collaborative build platform where pairs of people create, deploy, and learn together with AI agents — without needing to be developers.

## Vision

Praxis turns "we have an idea, but neither of us can really code" into a working prototype within an afternoon. It hosts Claude Code and OpenAI Codex in a managed multiplayer environment, with template-driven project starters, in-sandbox preview deployment, and a contextual educational layer.

The platform is designed for pairs. Two people building something together with AI agents is a revealing way to test collaboration, contributions, and idea viability. Every user builds a portfolio of projects, skills, and completed learning that serves as visible evidence of capability.

## Target Audience

- **Potential co-founders** testing collaboration pre-commitment
- **Teammates** exploring internal ideas or proof-of-concepts
- **Mentor-mentee pairs** learning to build with AI agents
- **Hackathon and study partners**
- **Friends with an idea** who want to see what it could look like

## Product Pillars

| Pillar | Description |
|--------|-------------|
| **Template-driven initiation** | Pick what to build (web game, SaaS, dashboard) and get a pre-configured sandbox with libraries and conventions |
| **Real-time collaborative workspace** | Shared environment with file tree, code preview, and prompt history visible to both partners |
| **Dual-harness agent support** | Claude Code and OpenAI Codex in per-project sandboxes via user OAuth subscriptions |
| **In-sandbox preview deployment** | Live URL during sessions for real-time previews |
| **Embedded learning** | Educational content woven into the workspace with progress tracking |
| **Profile and portfolio** | User profiles showing projects, skills, and learning history |

## Tech Stack

- **Frontend:** Next.js 14 (App Router), shadcn/ui, Tailwind, Monaco editor
- **Hosting:** Cloudflare Pages
- **Backend:** Bun + Hono on Fly.io
- **Database:** Postgres
- **Auth:** Better Auth or Lucia with OAuth for Anthropic/OpenAI
- **Sandboxing:** E2B (swappable)
- **Agent harnesses:** Claude Code + OpenAI Codex behind abstraction layer

## Business Model

Bring Your Own Subscription — users link their own Anthropic and OpenAI accounts via OAuth. The platform charges a flat monthly fee for the collaborative layer (workspace, sandbox, templates, education, deployment).

| Tier | Price | Features |
|------|-------|----------|
| Trial | Free (14 days) | Platform-managed agent access, one active project |
| Standard | £15/user/month | BYO subscription, multiple projects, full libraries |
| Plus | £35/user/month | Persistent preview URLs, priority sandbox startup |
| Enterprise | Custom | Real hosted deployment, SSO/SAML, team admin |

## Documentation

See [docs/project_overview.md](docs/project_overview.md) for the full executive summary and detailed product definition.
