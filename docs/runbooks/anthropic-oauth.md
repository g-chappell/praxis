# Runbook: Anthropic (Claude) OAuth

How a Praxis user connects their own Claude subscription so the orchestrator
can drive Claude Code on their plan. Implements the **PKCE public-client**
"Sign in with Claude" flow (see ADR-0006), not a confidential authorization-code
flow — there is no client secret.

## Flow

```
/settings → "Connect Anthropic"
  → GET /api/oauth/anthropic/authorize
      mints CSRF state + PKCE verifier/challenge
      sets httpOnly cookies (anthropic_oauth_state, anthropic_oauth_verifier)
      302 → https://claude.ai/oauth/authorize?...&code_challenge=...&state=...
  → user consents on claude.ai
  → 302 → GET /api/oauth/anthropic/callback?code=...&state=...
      verifies state == cookie (timing-safe)
      POST https://console.anthropic.com/v1/oauth/token  (code + code_verifier)
      encrypts access/refresh via @praxis/crypto
      upserts oauth_tokens (unique on user_id, provider='anthropic')
      302 → /settings?connected=1
```

At agent-spawn time the orchestrator calls `getValidAnthropicToken(userId)`,
which refreshes when the access token is within 60s of expiry and passes the
token to Claude Code via `CLAUDE_CODE_OAUTH_TOKEN`.

## Configuration

These are read by `apps/web/lib/anthropic-oauth.ts`:

| Env var | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_OAUTH_CLIENT_ID` | Claude Code public client ID | Override if a Praxis-specific public client is registered. |
| `ANTHROPIC_OAUTH_REDIRECT_URI` | `${BETTER_AUTH_URL}/api/oauth/anthropic/callback` | Must match exactly what Anthropic has allow-listed for the client. |
| `PRAXIS_MASTER_KEY` | — | 32-byte base64 key for token encryption. See `key-rotation.md`. |

No client secret is required (PKCE).

## Operator follow-ups

- [ ] **Confirm the redirect URI is accepted.** The default public client may
      only allow-list `https://console.anthropic.com/oauth/code/callback`. Verify
      that `https://praxis.blacksail.dev/api/oauth/anthropic/callback` is accepted
      by walking the flow live (below). If Anthropic rejects the redirect_uri,
      either register a public client that allow-lists the Praxis callback and set
      `ANTHROPIC_OAUTH_CLIENT_ID`, or set `ANTHROPIC_OAUTH_REDIRECT_URI` to an
      accepted value.
- [ ] **Add `PRAXIS_MASTER_KEY`** to `/etc/praxis/praxis.env` (ASCII-only, no
      inline comment — see `key-rotation.md`).

## Verify live (tier-1 deploy rule — CI can't run consent)

1. Sign in, open `https://app.<domain>/settings`.
2. Click **Connect Anthropic** → consent on claude.ai → land back on `/settings`
   showing **Connected to Anthropic ✓**.
3. Confirm the row exists and decrypts:

   ```bash
   # On the VPS, against the project DB:
   psql "$DATABASE_URL" -c \
     "select user_id, provider, expires_at, connected_at from oauth_tokens where provider='anthropic';"
   ```

   A row with non-null `access_token_encrypted` proves persistence; decryption is
   exercised by the refresh path on the next agent spawn.

## Failure modes surfaced on /settings

| `?error=` | Cause |
| --- | --- |
| `state_mismatch` | CSRF state cookie didn't match — stale tab, or forged callback. |
| `missing_oauth_params` | Cookies expired (10 min TTL) or callback hit without a code. |
| `exchange_failed` | Anthropic rejected the code exchange (bad redirect_uri / client). |
| `access_denied` | User declined consent on claude.ai. |

## Related

- ADR-0006 — PKCE subscription OAuth decision.
- `docs/runbooks/key-rotation.md` — the key protecting these tokens.
- `apps/web/lib/anthropic-oauth.ts`, `app/api/oauth/anthropic/*`.
