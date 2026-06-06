import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { CreateProjectForm } from '@/components/create-project-form';
import { DeleteProjectButton } from '@/components/delete-project-button';
import { EditProjectButton } from '@/components/edit-project-button';
import { getAuth } from '@/lib/auth';
import { listUserProjects } from '@/lib/projects';

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

  const projects = await listUserProjects(session.user.id);

  return (
    <>
      <AppNav />
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
            <p className="text-sm text-muted-foreground">Open one to resume, or start a new one.</p>
          </div>
          <CreateProjectForm />
        </div>

        {projects.length === 0 ? (
          <div className="rounded-md border border-dashed px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No projects yet. Start one to build with the agent.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-medium">{p.name}</span>
                  {p.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  )}
                  {p.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      Created {p.createdAt.toISOString().slice(0, 10)}
                    </span>
                  )}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/projects/${p.id}`}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Open
                  </Link>
                  <EditProjectButton projectId={p.id} name={p.name} description={p.description} />
                  <DeleteProjectButton projectId={p.id} projectName={p.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
