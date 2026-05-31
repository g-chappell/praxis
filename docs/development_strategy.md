# Development Strategy

**Document type:** Working agreement for two-person async build
**Status:** Initial; revisit after two weeks of contact with reality

---

## Working assumptions

Two contributors, distributed, no formal time commitment — roughly a handful of hours per week each. One weekly sync call. Everything else asynchronous.

This shapes three things: small work units, repo-as-source-of-truth, and a meeting cadence that resolves blockers without becoming the bottleneck.

---

## Meeting cadence

**One weekly voice call.** 45–60 minutes, same slot each week. Agenda:

- Status update from each side (a few minutes each — what shipped, what's in flight, what's blocked)
- Decisions that need a joint call (architecture, scope changes, priority shifts)
- Roadmap check (are we tracking against the milestone)
- Demo of anything new

If there's nothing to discuss, the call is short. If there's a lot, the structure prevents drift.

**Async between calls.** PR comments and GitHub issue threads for anything tied to specific work. A shared chat channel (Discord or similar) for ad-hoc questions. Loom or short video for anything visual that doesn't justify a synchronous call. No DMs for project work — decisions should be findable in the repo or the chat.

---

## Branching strategy

**Trunk-based development.** `main` is always deployable.

- Short-lived feature branches off `main`
- Branch naming: `<initials>/<short-description>` (e.g. `gw/magic-link-auth`)
- Open PRs early as drafts to signal direction
- Keep PRs small (target under ~400 lines diff); break bigger work into smaller PRs
- The other contributor reviews; for non-architectural PRs, "ship it" is enough
- If the other side is unavailable for over 24 hours and the change is non-architectural, self-merge with a note on the PR
- Architectural changes (schema, new external dependencies, ACP/sandbox interfaces, security-relevant code) require the other contributor's review before merge — no self-merge exceptions

**CI.** Lint (Biome), TypeScript type check, a small smoke test. Must pass before merge. Under two minutes per PR.

---

## Work distribution

Component ownership reduces conflict on shared surfaces. Each component has a primary owner who is the deciding voice on its design; the other contributor can propose changes via PR.

| Component | Primary | Notes |
|---|---|---|
| Frontend (Next.js, workspace UI) | A | |
| Orchestrator and ACP host | B | |
| Sandbox layer + Docker infrastructure | B | |
| Templates (scaffold, MCP config) | A | |
| Auth and OAuth flows | Either | |
| MCP servers (image gen for POC) | B | |
| Curated learning content | Either | |
| Documentation and ADRs | Both | Equally |
| Deployment and ops | B | |

The split is a starting suggestion based on natural component boundaries. Refine it in the first sync if it doesn't match your strengths or interests.

**Task management on GitHub.** The roadmap and task list live on a GitHub Projects board. Issues are the unit of work; the project board's columns track state. The `In Progress` column is the source of truth for what's actively being worked on — check it before starting an issue. If you both want to work on the same area, resolve it in the weekly call or async chat.

Both contributors configure GitHub's official MCP server (`github/github-mcp-server`) in their Claude Code and Codex setups, so agents working on this codebase can read and update the board directly — move tickets, create issues from work-in-progress, update field values, link PRs to issues, post status updates. The board is the canonical task surface; there is no local `TODO.md` or roadmap JSON to keep in sync with it.

---

## Documentation conventions

The codebase follows the cross-tool documentation conventions described in the Project Plan: AGENTS.md as the primary agent-context file at the root and per major sub-folder, CLAUDE.md as a thin importer of AGENTS.md, `.claude/skills/` for project-specific Claude Code skills, ADRs in `docs/decisions/` for any decision that crosses component boundaries or introduces a new external dependency.

Both contributors maintain these files as the codebase evolves. The discipline pays off — both for the two of you and for any AI agents working on the code, including Claude Code and Codex sessions you'll inevitably run yourselves.

**Two rules of thumb.** First: if you've explained the same thing twice, write it down. Second: if you find yourself disagreeing with a decision someone made a week ago, check whether there's an ADR; if not, that's the gap to fix.

---

## Iteration

This document is itself a starting hypothesis. After two weeks of building, revisit. Things likely to shift: component ownership (real work surfaces real specialisations), PR size discipline (the natural batch size will reveal itself), sync frequency (weekly may be too rare or too frequent).

Update this file rather than holding the change in your head.
