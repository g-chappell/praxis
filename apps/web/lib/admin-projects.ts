// Admin-only project data access (STORY-44). DELIBERATELY separate from
// lib/projects.ts: these helpers see EVERY project regardless of ownership and
// must never be reachable without an isUserAdmin gate at the route. They do not
// touch (or widen) userOwnsProject / the owner-scoped helpers (STORY-44 AC#3).

import { eq, sql } from 'drizzle-orm';

import { projects, sessions, teamMemberships, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import type { ProjectStatus } from './projects';

/** A project row for the admin directory: the project, its owner, member count,
 *  and last activity (most recent session start). `archivedAt` null = active. */
export interface AdminProjectRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | null;
  archivedAt: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  lastActivityAt: Date | null;
}

/** Admin list sort: created recent/oldest, by name, or by last activity. */
export type AdminProjectSort = 'recent' | 'oldest' | 'name' | 'activity';

export function parseAdminProjectSort(value: unknown): AdminProjectSort {
  return value === 'oldest' || value === 'name' || value === 'activity' ? value : 'recent';
}

/** Every project (any owner) with owner + member count + last activity, filtered
 *  by status and a free-text query over name/owner, sorted. POC scale (tens of
 *  projects): the aggregates are grouped DB queries and the search/sort run in
 *  memory over the merged rows — simple and correct; revisit if the catalog grows.
 *  The `database` is injectable for persistence tests. */
export async function adminListProjects(
  opts: { q?: string; sort?: AdminProjectSort; status?: ProjectStatus } = {},
  database: Database = db,
): Promise<AdminProjectRow[]> {
  const status = opts.status ?? 'all';
  const sort = opts.sort ?? 'recent';
  const q = opts.q?.trim().toLowerCase();

  const base = await database
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      archivedAt: projects.archivedAt,
      teamId: projects.teamId,
      ownerId: users.id,
      ownerName: users.displayName,
      ownerEmail: users.email,
    })
    .from(projects)
    .leftJoin(users, sql`${users.id} = ${projects.createdBy}`);

  const memberRows = await database
    .select({ teamId: teamMemberships.teamId, count: sql<number>`count(*)::int` })
    .from(teamMemberships)
    .groupBy(teamMemberships.teamId);
  const membersByTeam = new Map(memberRows.map((r) => [r.teamId, r.count]));

  const activityRows = await database
    .select({ projectId: sessions.projectId, last: sql<Date | null>`max(${sessions.startedAt})` })
    .from(sessions)
    .groupBy(sessions.projectId);
  const lastByProject = new Map(activityRows.map((r) => [r.projectId, r.last]));

  let rows: AdminProjectRow[] = base.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt,
    archivedAt: p.archivedAt,
    ownerId: p.ownerId,
    ownerName: p.ownerName,
    ownerEmail: p.ownerEmail,
    memberCount: membersByTeam.get(p.teamId) ?? 0,
    lastActivityAt: lastByProject.get(p.id) ?? null,
  }));

  if (status === 'active') rows = rows.filter((r) => r.archivedAt === null);
  else if (status === 'archived') rows = rows.filter((r) => r.archivedAt !== null);

  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.ownerEmail?.toLowerCase().includes(q) ?? false) ||
        (r.ownerName?.toLowerCase().includes(q) ?? false),
    );
  }

  const time = (d: Date | null) => (d ? d.getTime() : 0);
  rows.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'oldest') return time(a.createdAt) - time(b.createdAt);
    if (sort === 'activity') return time(b.lastActivityAt) - time(a.lastActivityAt);
    return time(b.createdAt) - time(a.createdAt); // recent (default)
  });

  return rows;
}

/** Archive/restore ANY project by id (admin moderation, STORY-44). No ownership
 *  check — the route gates on isUserAdmin; this must never be called unguarded.
 *  Mirrors setProjectArchived's effect (sets/clears archived_at, leaves the
 *  volume to the idle sweep) without the owner constraint. Returns false when the
 *  project doesn't exist. */
export async function adminSetProjectArchived(
  projectId: string,
  archive: boolean,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .update(projects)
    .set({ archivedAt: archive ? new Date() : null })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return Boolean(row);
}

/** Delete ANY project by id (admin moderation, STORY-44), cascading its sessions.
 *  No ownership check — the route gates on isUserAdmin. Sandbox teardown is the
 *  caller's job via the orchestrator (same as the owner path); this removes the DB
 *  rows only. Returns false when the project doesn't exist. */
export async function adminDeleteProject(
  projectId: string,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return Boolean(row);
}
