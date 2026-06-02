import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { oauthTokens } from '@praxis/db';
import { db } from '@praxis/db/client';

import { AppNav } from '@/components/app-nav';
import { ConnectClaudeCode } from '@/components/connect-claude-code';
import { DisconnectAnthropicButton } from '@/components/disconnect-anthropic-button';
import { PROVIDER } from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Settings — Praxis',
};

export default async function SettingsPage() {
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

  return (
    <>
      <AppNav />
      <main className="flex flex-col items-center px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{session.user.email}</span>.
            </p>
          </div>

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
              <ConnectClaudeCode />
            )}
          </section>
        </div>
      </main>
    </>
  );
}
