# Collaborative Build Platform — Executive Summary (v4)

**Document type:** Agreed product definition, post-partner discussion
**Status:** Direction set. Detailed project plan in companion document.
**Working name:** TBD.

---

## Vision

A platform where two people build, deploy, and learn together with AI agents — without needing to be developers.

The platform turns "we have an idea, but neither of us can really code" into a working prototype within an afternoon. It does this by hosting Claude Code and OpenAI Codex in a managed multiplayer environment, with template-driven project starters, in-sandbox preview deployment, and a contextual educational layer that grows each user's capability as they build.

It is designed for pairs. Two people building something together with AI agents is a uniquely revealing way to test whether they collaborate well, what they each bring, and whether the idea is worth taking further. The platform does not grade or rank its users. Instead, every user builds a portfolio of projects, skills, and completed learning that serves as the visible record of what they can do — and is the natural way partners assess each other before deciding to commit.

The core insight: in 2026, the most accurate way to evaluate "can we work together?" is no longer the conversation, the whiteboard interview, or the CV. It is a few hours building something real, with agents doing the heavy lifting and the humans doing the deciding.

---

## Target Audience

### Primary

Pairs of non-technical or lightly-technical people who want to build something together. Most commonly:

- **Potential co-founders** pre-commitment, testing whether they collaborate well and whether the idea has legs
- **Teammates** exploring an internal idea or proof-of-concept
- **Mentor-mentee** pairs where one is teaching the other to build with AI agents
- **Hackathon and study partners**, especially in education contexts
- **Friends with an idea** who want to see what it could look like before committing time or money

Characteristics: comfortable with AI tools, not necessarily fluent in code, motivated by an outcome rather than the craft of building. They will pay if the product reliably gets them from idea to something visible.

### Secondary (advanced tiers)

Technically proficient users who want a multiplayer Claude Code or Codex environment with deployment included. They use the same platform but bypass much of the abstraction — direct access to the underlying harness, full control over the stack, fewer guard-rails.

### Explicitly out of scope

- Solo users (the platform's value is pairing)
- Larger teams (pairs only in v1; revisit later)
- Production engineering at scale (the platform builds prototypes, not enterprise systems)
- Pure assessment use cases (the platform de-prioritises rubric-based evaluation; the portfolio is the assessment)

---

## Product Pillars

Six surfaces define the platform.

### 1. Template-driven project initiation

Users do not start from `npm init`. They pick what they want to build — "web-based game," "SaaS landing site with auth," "internal CRM," "data dashboard" — and the platform provides a pre-configured sandbox with the chosen libraries, structure, and conventions. The template is transparent: users see what is being used (React, Phaser, Postgres, etc.) without needing to wire it together. Each template specifies **which agent harness it runs on** — Claude Code or Codex — based on which produces the best results for that kind of project. The user does not pick the harness; the template does.

Claude Code templates ship first, with Codex templates added in turn as the harness-abstraction layer matures.

### 2. Real-time collaborative workspace

A shared environment where partners chat with each other and prompt the agent in the same surface. File tree, code preview, and prompt history are visible to both. Live editing is file-level locked initially, with character-level co-editing (Yjs) in a later phase. Designed so a non-technical user can follow what is happening without being overwhelmed.

### 3. Dual-harness agent support (per-template, BYO subscription)

The platform runs Claude Code and OpenAI Codex inside per-project sandboxes — the same way a user would run them locally, just multiplayer and managed. Users connect their own Anthropic or OpenAI accounts via OAuth (both providers support this for their coding agents), and the platform invokes the harness on their behalf using their subscription. The platform never carries inference cost as a variable; users get to use the providers they may already be subscribed to.

A custom **harness-abstraction layer** sits between the platform and the two products, providing a unified session, prompt, and tool-output interface so the rest of the codebase does not need to know which harness is active. This abstraction is core intellectual property and the natural place to plug in a third harness later.

### 4. In-sandbox preview deployment

Every project gets a live URL during the session, served from the sandbox. Both partners (and anyone they invite to view) can see what has been built in real time. Sandboxes shut down on inactivity — the preview URL dies when the project goes dormant and is reactivated when partners return. Advanced tiers unlock persistent hosted deployment to platforms like Cloudflare Pages or Vercel.

### 5. Embedded learning

Educational content is woven into the workspace. The platform's approach is **third-party-content-first** — Anthropic Cookbook, OpenAI tutorials, established community materials — with in-house authoring that **expands, reframes, and contextualises** that content for the platform's specific use cases: pair-building, non-technical users, template-driven projects, agentic prompting. Tracked at the user level: lessons completed, concepts engaged with, skill milestones reached. Tailored to both supported harnesses so users grow capability in whichever they end up using.

### 6. Profile and portfolio

Every user has a profile showing their projects, the templates they have used, the skills they have authored, the learning they have completed, and selected projects they have chosen to display. **Profiles are open by default within a team** (partners see each other's profiles automatically; this is the assessment mechanism) and **private by default globally** (the public web does not see profiles unless the user explicitly publishes them). Users own their projects under standard terms; the platform retains a minimal licence for hosting and product improvement.

The portfolio is the soft evidence of capability — a more honest assessment surface than any rubric.

---

## Capabilities Required

Grouped by category. Each is a body of work; this is the scope to size and stage.

| Category | Capabilities |
|---|---|
| **Identity & accounts** | Signup, login, email verification, password recovery, MFA, account deletion, data export; **OAuth linking to Anthropic and OpenAI accounts** for agent access |
| **Teams & projects** | Team creation (pair-only), member invitation with expiring tokens, project creation from templates, project membership |
| **Workspace** | Three-panel UI (file tree, editor, chat), prompt input, real-time sync, presence indicators, file locking |
| **Agent orchestration** | Per-project sandbox spawning, harness selection per template, prompt queueing, streaming responses to both users, tool-use observation; subscription-backed invocation via user OAuth |
| **Sandboxing** | Isolated execution per project, egress allowlist, resource limits, idle shutdown, audit logging |
| **Templates** | Template catalogue, template versioning, template-driven sandbox provisioning, harness specification, metadata visible in UI |
| **Preview deployment** | Sandbox-internal preview URLs, sharing mechanism, deployment-status visibility, restart on session resume |
| **Persistent deployment (advanced)** | Integration with Cloudflare Pages, Vercel, or similar; env management; build pipeline; deployment history |
| **Trial agent access** | Platform-managed temporary agent access for trial users (14 days); usage caps; transition to BYO at trial end |
| **Learning content** | Content catalogue, third-party ingestion + in-house authoring, harness-specific lessons, progress tracking, contextual surfacing, skill milestones |
| **Profiles & portfolio** | User profile pages, project showcases, learning history, default-open-within-team / default-private-globally visibility, selective publishing |
| **Billing & entitlements** | Subscription management, tier-based feature gates, trial management, provider-subscription verification |
| **Admin & moderation** | Internal admin console, user moderation, project inspection (with consent), abuse reports, feature flags, cost dashboards |
| **Observability** | Structured logging, per-session sandbox cost tracking, session replay, error tracking, alerting |
| **Security & compliance** | Secrets management, audit trails, GDPR deletion cascades, data residency, zero-retention mode on AI services |

---

## Tech Stack Framework

The stack prioritises shipping speed in P0 while keeping critical layers portable.

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Standard, hirable |
| Frontend hosting | Cloudflare Pages | Cheaper and less lock-in than Vercel |
| UI library | shadcn/ui + Tailwind | Accessible primitives |
| Code editor | Monaco | Yjs bindings available for later |
| Auth | Better Auth or Lucia + Postgres; **OAuth for Anthropic / OpenAI** | No auth vendor; provider linking is first-class |
| Database | Postgres (managed in P0, self-host-capable) | Plain SQL only |
| Realtime transport | Own WebSocket on Orchestrator | One authoritative source of truth |
| Pub/sub | Redis or Postgres LISTEN/NOTIFY | Self-hostable either way |
| Orchestrator | Bun + Hono on Fly.io | Lightweight, globally distributable |
| Agent harness | **Claude Code + OpenAI Codex** (subprocess in sandbox) behind harness-abstraction layer | Per-template selection; user OAuth credentials |
| Sandbox | E2B (behind a `Sandbox` interface) | Swappable to Firecracker, Daytona, or Docker+gVisor |
| Preview deployment | Sandbox-internal URLs | Native to sandbox runtime |
| Persistent deployment | Cloudflare Pages or Vercel via API | Higher-tier feature |
| Object storage | S3-compatible (Cloudflare R2) | Portable |
| Billing | Stripe | Standard |
| Email | Resend or similar | Transactional only |
| Observability | OpenTelemetry + Grafana + Sentry | Self-hostable if needed |
| AI services | Anthropic, OpenAI — **invoked via user OAuth subscriptions** | Zero-retention mode where supported |

Two defining stack pieces: the **harness-abstraction layer** that hides the differences between Claude Code and Codex from the rest of the platform; and the **OAuth integration with Anthropic and OpenAI** that allows agent invocation to be backed by user-owned subscriptions.

Discipline: every proprietary dependency has a documented swap-in.

---

## Business Model — Bring Your Own Subscription

The platform's business model decouples agent inference from platform pricing. Users link their own Anthropic and OpenAI accounts via OAuth (the same flow they would use to authenticate Claude Code or Codex on their local machine), and the platform invokes the agent on their behalf using their subscription. The platform charges a flat monthly fee for the collaborative layer — workspace, sandbox, templates, education, deployment — none of which the providers offer.

### Why this model

The agent is a commodity the user can already access directly from Anthropic and OpenAI. The platform's value is the collaboration layer, the templates, the education, the deployment, and the assessment-via-portfolio mechanism. Charging for the platform's value rather than reselling agent inference produces predictable unit economics, eliminates free-tier abuse, and aligns price with actual product value. It also avoids the platform becoming a thin AI reseller and removes a major source of cost volatility.

### Tier structure

| Tier | Pricing (working hypothesis) | Capabilities |
|---|---|---|
| **Trial** | Free, 14 days | Platform-managed temporary agent access (capped); sandbox preview; all features; one active project |
| **Standard** | £15 / user / month | BYO Claude or OpenAI subscription via OAuth; sandbox-bound preview; multiple active projects; full template library; full learning library; profile pages |
| **Plus** *(optional)* | £35 / user / month | BYO subscription + persistent preview URLs; priority sandbox startup; larger sandbox resources |
| **Enterprise** | Custom | Real hosted deployment to chosen platform; SSO/SAML; team-level admin; bulk seats; usage analytics; private projects |

The trial removes the "subscribe to two things before knowing this is for me" barrier. Standard is the volume tier and depends on BYO subscription. Plus adds persistent preview and faster startup for users who pair regularly. Enterprise is the institutional path with real deployment and org features.

### What the platform pays for

Even with BYO inference, the platform carries real costs: sandbox compute (E2B or alternative), database hosting, persistent preview hosting on Plus, real deployment on Enterprise, storage, web hosting, observability, and the platform-managed agent access during the 14-day trial. None of these are inference; all of them are predictable per active user. Trial agent access is the one inference cost the platform absorbs deliberately, capped and audited.

---

## Open Decisions

Decisions still to be made.

1. **Product name.** Deferred. Needed before any external communication, marketing site, or pitch.

2. **Codex parity timing.** Claude Code templates ship first. Codex templates follow as the harness-abstraction layer matures. Quarterly review based on user demand.

3. **Template catalogue scope.** Deferred to closer to build.

4. **Education content partnerships.** Deferred. Anthropic Cookbook and OpenAI tutorials are obvious starters; community content adds value but needs careful sourcing and attribution.

5. **Trial design.** Length (14 days is the starting assumption), agent budget cap, and what happens at expiry (downgrade to read-only? hard cut-off? prompt to OAuth?) — all decisions for product design closer to launch.

6. **Plus tier confidence.** Whether the £35 Plus tier is worth shipping in v1 or deferring to once volume is clearer. The decision rests on whether persistent preview is a strong enough conversion driver from Standard.

---

## Summary

The platform is a collaborative build environment for pairs — primarily non-technical co-founders and teammates, with advanced tiers for technical users — that hosts Claude Code and OpenAI Codex in managed multiplayer sandboxes. Users link their own Anthropic and OpenAI subscriptions via OAuth; the platform handles everything else.

Six product pillars (templates, workspace, dual-harness agents, in-sandbox preview, embedded learning, profile and portfolio) define what gets built. The business model is **bring your own subscription**, with a 14-day trial of platform-managed agent access to remove the onboarding barrier. The harness-abstraction layer and the OAuth integration with the two providers are the two defining pieces of platform engineering.

The detailed project plan accompanies this document.
