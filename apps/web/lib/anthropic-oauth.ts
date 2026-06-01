// Anthropic (Claude) subscription OAuth — PKCE public-client flow.
//
// Lets a user connect their own Claude Pro/Max plan so the orchestrator
// can drive Claude Code on their subscription. This is the "Sign in with
// Claude" flow (public client + PKCE, no client secret), not a confidential
// authorization-code flow — see ADR-0006 and docs/runbooks/anthropic-oauth.md.
//
// Tokens returned here are encrypted via @praxis/crypto before they touch
// the database; nothing in this module logs raw tokens.

import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const SCOPES = 'org:create_api_key user:profile user:inference';

export const STATE_COOKIE = 'anthropic_oauth_state';
export const VERIFIER_COOKIE = 'anthropic_oauth_verifier';
export const PROVIDER = 'anthropic';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getClientId(): string {
  return process.env.ANTHROPIC_OAUTH_CLIENT_ID ?? DEFAULT_CLIENT_ID;
}

/** Public callback URL Anthropic redirects to after consent. */
export function getRedirectUri(): string {
  if (process.env.ANTHROPIC_OAUTH_REDIRECT_URI) {
    return process.env.ANTHROPIC_OAUTH_REDIRECT_URI;
  }
  const base =
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === 'production'
      ? 'https://praxis.blacksail.dev'
      : 'http://localhost:3000');
  return `${base}/api/oauth/anthropic/callback`;
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function createState(): string {
  return base64url(randomBytes(32));
}

export function buildAuthorizeUrl(params: { state: string; challenge: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', getClientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface AnthropicTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry; null when the provider omits expires_in. */
  expiresAt: Date | null;
}

interface RawTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

function parseTokenResponse(raw: RawTokenResponse): AnthropicTokens {
  if (typeof raw.access_token !== 'string' || raw.access_token.length === 0) {
    throw new Error('token response missing access_token');
  }
  const refreshToken = typeof raw.refresh_token === 'string' ? raw.refresh_token : null;
  const expiresAt =
    typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in)
      ? new Date(Date.now() + raw.expires_in * 1000)
      : null;
  return { accessToken: raw.access_token, refreshToken, expiresAt };
}

/** Exchange an authorization code for tokens (PKCE proof via code_verifier). */
export async function exchangeCode(input: {
  code: string;
  verifier: string;
}): Promise<AnthropicTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: getClientId(),
      redirect_uri: getRedirectUri(),
      code_verifier: input.verifier,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return parseTokenResponse((await res.json()) as RawTokenResponse);
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshTokens(refreshToken: string): Promise<AnthropicTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: getClientId(),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic token refresh failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const tokens = parseTokenResponse((await res.json()) as RawTokenResponse);
  // Some providers omit refresh_token on refresh; keep the prior one.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
