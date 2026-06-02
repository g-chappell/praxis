// Project + team helpers (STORY-09). A project needs a team (FK notNull); the POC
// gives each user an implicit "Personal" team on first project. Full team
// management is a later epic.

import { and, eq } from 'drizzle-orm';

import { projects, teamMemberships, teams } from '@praxis/db';
import { db } from '@praxis/db/client';

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

/** True iff the user is a member of the team that owns the project. */
export async function userOwnsProject(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(and(eq(projects.id, projectId), eq(teamMemberships.userId, userId)))
    .limit(1);
  return Boolean(row);
}
