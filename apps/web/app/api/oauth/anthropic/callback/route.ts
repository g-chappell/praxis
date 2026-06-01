// GET /api/oauth/anthropic/callback
// Anthropic redirects here after consent. Verifies the CSRF `state`
// against the cookie, exchanges the code using the stored PKCE verifier,
// encrypts the tokens, and upserts the user's oauth_tokens row.

import { timingSafeEqual } from 'node:crypto';

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { encrypt } from '@praxis/crypto';
import { oauthTokens } from '@praxis/db';
import { db } from '@praxis/db/client';

import { PROVIDER, STATE_COOKIE, VERIFIER_COOKIE, exchangeCode } from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function settingsRedirect(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/settings', req.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  // The flow is over either way — clear the short-lived cookies.
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(VERIFIER_COOKIE);
  return res;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.redirect(new URL('/signin', req.nextUrl.origin));
  }

  const code = req.nextUrl.searchParams.get('code');
  const returnedState = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  const verifier = req.cookies.get(VERIFIER_COOKIE)?.value;

  const providerError = req.nextUrl.searchParams.get('error');
  if (providerError) {
    return settingsRedirect(req, { error: providerError });
  }
  if (!code || !returnedState || !cookieState || !verifier) {
    return settingsRedirect(req, { error: 'missing_oauth_params' });
  }
  if (!safeEqual(returnedState, cookieState)) {
    return settingsRedirect(req, { error: 'state_mismatch' });
  }

  let tokens;
  try {
    tokens = await exchangeCode({ code, verifier });
  } catch {
    return settingsRedirect(req, { error: 'exchange_failed' });
  }

  const accessTokenEncrypted = await encrypt(tokens.accessToken);
  const refreshTokenEncrypted = tokens.refreshToken ? await encrypt(tokens.refreshToken) : null;

  await db
    .insert(oauthTokens)
    .values({
      userId: session.user.id,
      provider: PROVIDER,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      expiresAt: tokens.expiresAt,
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt: tokens.expiresAt,
        connectedAt: new Date(),
      },
    });

  return settingsRedirect(req, { connected: '1' });
}
