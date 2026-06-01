# 0006 — Anthropic OAuth via PKCE subscription flow (public client)

**Date:** 2026-06-01
**Status:** Accepted

## Context

STORY-06 connects a user's Anthropic account so the orchestrator can run
Claude Code on *their* plan ("the prompting user's credentials are used" —
`docs/project_plan.md` §6). §10 of that plan describes a "standard OAuth flow"
with "the platform's client ID and required scopes" and refresh tokens — which
reads like a **confidential-client** authorization-code flow (a registered
client with a secret).

In practice Anthropic does not offer a generic third-party OAuth provider where
a platform registers a confidential client to obtain tokens against a user's
**Claude subscription**. The mechanism that actually grants a credential usable
by Claude Code on a user's Pro/Max plan is the "Sign in with Claude" flow: a
**PKCE public client** (no secret), authorizing at `claude.ai/oauth/authorize`
and exchanging at `console.anthropic.com/v1/oauth/token`. This ADR records the
divergence from the §10 wording and the chosen flow, because OAuth/token
handling is load-bearing security (see AGENTS.md "Never do").

## Decision

Implement the **PKCE public-client** flow.

- No client secret. CSRF protection is a `state` cookie *plus* the PKCE
  `code_verifier` (httpOnly, 10-min TTL), both verified on callback.
- Client ID and redirect URI are env-configurable (`ANTHROPIC_OAUTH_CLIENT_ID`,
  `ANTHROPIC_OAUTH_REDIRECT_URI`), defaulting to the Claude Code public client
  and `${BETTER_AUTH_URL}/api/oauth/anthropic/callback`. This lets the operator
  register a Praxis-specific public client without a code change.
- Tokens are encrypted at rest with `@praxis/crypto` (ADR-adjacent: `oauth_tokens`,
  `PRAXIS_MASTER_KEY`) and never logged.
- `getValidAnthropicToken(userId)` refreshes when the access token is within 60s
  of expiry; the orchestrator calls it at agent-spawn time and passes the token
  to Claude Code via `CLAUDE_CODE_OAUTH_TOKEN`.

Flow, endpoints, env, and operator follow-ups are documented in
`docs/runbooks/anthropic-oauth.md`.

## Consequences

- Matches reality and §6's "user's own subscription" intent; no secret to store
  or rotate for the OAuth client itself.
- The default public client's allow-listed redirect URIs are outside our control.
  An operator must verify the live round-trip accepts the Praxis callback (or
  register a public client / set `ANTHROPIC_OAUTH_REDIRECT_URI`). Captured as an
  operator follow-up in the runbook; the consent round-trip can't run in CI.
- OpenAI/Codex OAuth (next phase) is a *different* flow — do not assume this one
  generalizes; it will get its own ADR.
- Swapping to a confidential-client flow later (if Anthropic ships one) is an
  ADR + a `lib/anthropic-oauth.ts` change, not a schema change — `oauth_tokens`
  already stores access/refresh/expiry generically.

## Alternatives considered

- **Confidential-client authorization-code flow (literal §10).** Needs an
  Anthropic-issued client secret for subscription access, which isn't offered;
  rejected as not buildable today.
- **API-key paste (user pastes an Anthropic API key).** Simpler, but bills the
  platform's/!user's API account rather than running on their Claude subscription,
  and pushes raw long-lived secrets through the UI. Rejected — wrong billing
  model and worse security posture than short-lived OAuth tokens.
