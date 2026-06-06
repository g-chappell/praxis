'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ArchiveProjectButton } from '@/components/archive-project-button';
import { DeleteProjectButton } from '@/components/delete-project-button';
import { DuplicateProjectButton } from '@/components/duplicate-project-button';
import { EditProjectButton } from '@/components/edit-project-button';
import type { ProjectSort, ProjectStatus, ProjectSummary } from '@/lib/projects';

// Dashboard project list with client-side search + sort (STORY-41). The server
// fetches the status-filtered slice; filtering and ordering happen here over the
// loaded array — sufficient at POC scale (a pair's project count is small; no
// pagination). The Active/Archived tabs live in the server page (URL-driven).
const SORTS: { value: ProjectSort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name' },
];

function compare(a: ProjectSummary, b: ProjectSummary, sort: ProjectSort): number {
  if (sort === 'name') return a.name.localeCompare(b.name);
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return sort === 'oldest' ? at - bt : bt - at;
}

export function ProjectList({
  projects,
  status,
}: {
  projects: ProjectSummary[];
  status: ProjectStatus;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>('recent');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => compare(a, b, sort));
  }, [projects, query, sort]);

  // Distinct from the no-match state below: the user has no projects in this tab.
  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground" data-testid="projects-empty">
          {status === 'archived'
            ? 'No archived projects.'
            : 'No projects yet. Start one to build with the agent.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          data-testid="project-search"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ProjectSort)}
          aria-label="Sort projects"
          data-testid="project-sort"
          className="shrink-0 rounded-md border px-3 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground" data-testid="projects-no-match">
            No projects match “{query.trim()}”.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {visible.map((p) => (
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
                    Created {new Date(p.createdAt).toISOString().slice(0, 10)}
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
                {p.archivedAt === null && (
                  <>
                    <EditProjectButton projectId={p.id} name={p.name} description={p.description} />
                    <DuplicateProjectButton projectId={p.id} />
                  </>
                )}
                <ArchiveProjectButton
                  projectId={p.id}
                  projectName={p.name}
                  archived={p.archivedAt !== null}
                />
                <DeleteProjectButton projectId={p.id} projectName={p.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
