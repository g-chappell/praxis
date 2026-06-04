// Project + team helpers (STORY-09). A project needs a team (FK notNull); the POC
// gives each user an implicit "Personal" team on first project. Full team
// management is a later epic.

import { and, desc, eq } from 'drizzle-orm';

import { projects, teamMemberships, teams } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: Date | null;
}

/** Return the user's first team, creating a personal team + membership if none. */
export async function ensurePersonalTeam(userId: string): Promise<string> {
  const [existing] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .limit(1);
  if (existing) return existing.teamId;

  const [team] = await db
    .insert(teams)
    .values({ name: 'Personal', createdBy: userId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId });
  return team!.id;
}

/** True iff the user is a member of the team that owns the project. The `db` is
 *  injectable for persistence tests; defaults to the @praxis/db/client singleton. */
export async function userOwnsProject(
  userId: string,
  projectId: string,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(and(eq(projects.id, projectId), eq(teamMemberships.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** All projects in the user's team(s), newest first. */
export async function listUserProjects(userId: string): Promise<ProjectSummary[]> {
  return db
    .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(projects.createdAt));
}

/** Delete a project the user owns (cascades its sessions). Returns false when the
 *  project doesn't exist or isn't theirs. Sandbox teardown is handled by the
 *  caller via the orchestrator — this only removes the DB rows. */
export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  if (!(await userOwnsProject(userId, projectId))) return false;
  await db.delete(projects).where(eq(projects.id, projectId));
  return true;
}
