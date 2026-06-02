import { headers } from 'next/headers';
import Link from 'next/link';

import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin overview — Praxis',
};

// Admin sections. Each lands in its own story; until then it shows an honest
// "not yet available" state rather than a dead link (EPIC-05).
const SECTIONS: ReadonlyArray<{ title: string; description: string; href?: string }> = [
  {
    title: 'Platform API key',
    description: 'Set and rotate the Anthropic API key that powers all agent sessions.',
    href: '/admin/api-keys',
  },
  {
    title: 'Usage',
    description: 'Per-project token usage and cost across the platform.',
  },
];

export default async function AdminOverviewPage() {
  // The layout already enforced admin access; this is just for display.
  const session = await getAuth().api.getSession({ headers: await headers() });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{session?.user.email}</span>.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const body = (
            <>
              <h2 className="font-medium">{section.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              {!section.href && (
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Not yet available
                </p>
              )}
            </>
          );
          return (
            <li key={section.title} className="rounded-lg border p-4">
              {section.href ? (
                <Link href={section.href} className="block transition-opacity hover:opacity-70">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
