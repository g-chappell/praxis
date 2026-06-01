import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SignOutButton } from '@/components/sign-out-button';
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-medium">{session.user.email}</span>.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
