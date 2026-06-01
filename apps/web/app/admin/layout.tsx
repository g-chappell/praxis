import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { SignOutButton } from '@/components/sign-out-button';
import { adminAccess, isUserAdmin } from '@/lib/admin';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin — Praxis',
};

// Guard for every /admin/* route. Middleware only checks cookie presence;
// this is the canonical check (valid session + admin role). See EPIC-05.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const signedIn = Boolean(session?.user);
  const isAdmin = session?.user ? await isUserAdmin(session.user.id) : false;

  const access = adminAccess({ signedIn, isAdmin });
  if (access === 'redirect-signin') redirect('/signin?next=/admin');
  if (access === 'redirect-dashboard') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-baseline gap-3">
          <Link href="/admin" className="text-lg font-semibold tracking-tight">
            Praxis Admin
          </Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Dashboard
          </Link>
        </div>
        <SignOutButton />
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
