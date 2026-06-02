import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { NewProjectButton } from '@/components/new-project-button';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Dashboard — Praxis',
};

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  // Middleware redirects unauthenticated requests but the page-level
  // check is the canonical guard (middleware only checks cookie presence,
  // not validity).
  if (!session?.user) {
    redirect('/signin');
  }

  // Admin / Settings / Sign out now live in the shared nav.
  return (
    <>
      <AppNav />
      <main className="flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Start a project to build with the agent.
            </p>
          </div>
          <NewProjectButton />
        </div>
      </main>
    </>
  );
}
