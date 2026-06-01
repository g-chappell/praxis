import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, and } from 'drizzle-orm';

import { oauthTokens } from '@praxis/db';
import { db } from '@praxis/db/client';

import { Button } from '@/components/ui/button';
import { DisconnectAnthropicButton } from '@/components/disconnect-anthropic-button';
import { PROVIDER } from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Settings — Praxis',
};

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: 'Sign-in could not be verified (state mismatch). Please try again.',
  missing_oauth_params: 'The connection was interrupted. Please try again.',
  exchange_failed: 'Anthropic rejected the connection. Please try again.',
  access_denied: 'You declined the connection.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; disconnected?: string };
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/signin');
  }

  const [token] = await db
    .select({ connectedAt: oauthTokens.connectedAt })
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, session.user.id), eq(oauthTokens.provider, PROVIDER)))
    .limit(1);

  const isConnected = Boolean(token);
  const connectedAt = token?.connectedAt ?? null;
  const errorMessage = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong. Please try again.')
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{session.user.email}</span>.
          </p>
        </div>

        {searchParams.connected && isConnected ? (
          <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
            Connected to Claude Code ✓
          </p>
        ) : null}
        {searchParams.disconnected && !isConnected ? (
          <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            Disconnected from Claude Code.
          </p>
        ) : null}
        {errorMessage ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>
        ) : null}

        <section className="space-y-3 rounded-lg border p-5">
          <div className="space-y-1">
            <h2 className="font-medium">Claude Code</h2>
            <p className="text-sm text-muted-foreground">
              Connect your Claude subscription so the agent runs on your plan.
            </p>
          </div>

          {isConnected ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-green-700">Connected to Claude Code ✓</p>
                {connectedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Connected {connectedAt.toLocaleDateString()}
                  </p>
                ) : null}
              </div>
              <DisconnectAnthropicButton />
            </div>
          ) : (
            <Button asChild>
              <a href="/api/oauth/anthropic/authorize">Connect to Claude Code</a>
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}
