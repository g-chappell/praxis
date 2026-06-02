import { headers } from 'next/headers';
import Link from 'next/link';

import { SignOutButton } from '@/components/sign-out-button';
import { isUserAdmin } from '@/lib/admin';
import { getAuth } from '@/lib/auth';

// Shared top navigation for signed-in pages so a user can always move between
// surfaces. Self-contained (reads the session + role) so pages just render
// <AppNav />. A richer workspace shell comes later (roadmap).
export async function AppNav() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const admin = await isUserAdmin(session.user.id);

  const link = 'text-muted-foreground transition-colors hover:text-foreground';

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/dashboard" className="font-semibold tracking-tight text-foreground">
          Praxis
        </Link>
        <Link href="/dashboard" className={link}>
          Dashboard
        </Link>
        {admin && (
          <Link href="/admin" className={link}>
            Admin
          </Link>
        )}
        <Link href="/settings" className={link}>
          Settings
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">{session.user.email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
