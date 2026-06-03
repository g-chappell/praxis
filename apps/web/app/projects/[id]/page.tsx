import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { getAuth } from '@/lib/auth';
import { userOwnsProject } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Workspace — Praxis',
};

export default async function ProjectWorkspacePage({ params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/signin');
  }
  // Canonical ownership guard (middleware only checks cookie presence).
  if (!(await userOwnsProject(session.user.id, params.id))) {
    redirect('/dashboard');
  }

  return (
    <div className="flex h-screen flex-col">
      <AppNav />
      <main className="min-h-0 flex-1">
        <WorkspaceShell projectId={params.id} />
      </main>
    </div>
  );
}
