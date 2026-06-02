import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ChatPanel } from '@/components/workspace/chat-panel';
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
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-6 py-8">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Workspace</h1>
      <div className="min-h-0 flex-1">
        <ChatPanel projectId={params.id} />
      </div>
    </main>
  );
}
