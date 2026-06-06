// Project + team helpers (STORY-09). A project needs a team (FK notNull); the POC
// gives each user an implicit "Personal" team on first project. Full team
// management is a later epic.

import { and, desc, eq } from 'drizzle-orm';

import { projects, teamMemberships, teams } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | null;
}

/** Field length bounds shared by the PATCH boundary and the edit form. */
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 280;

export type ProjectPatchError = 'invalid_name' | 'invalid_description' | 'no_fields';

/** Validate a PATCH body at the HTTP boundary (pure — no DB). `name`, when
 *  present, must be a non-empty string ≤ NAME_MAX after trim; `description`,
 *  when present, a string ≤ DESCRIPTION_MAX after trim. At least one field is
 *  required. Returns the raw (untrimmed) fields to forward to updateProject,
 *  which does the trimming. */
export function parseProjectPatch(
  body: { name?: unknown; description?: unknown } | null,
): { fields: { name?: string; description?: string } } | { error: ProjectPatchError } {
  const fields: { name?: string; description?: string } = {};
  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > NAME_MAX) {
      return { error: 'invalid_name' };
    }
    fields.name = body.name;
  }
  if (body?.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length > DESCRIPTION_MAX) {
      return { error: 'invalid_description' };
    }
    fields.description = body.description;
  }
  if (fields.name === undefined && fields.description === undefined) {
    return { error: 'no_fields' };
  }
  return { fields };
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
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(projects.createdAt));
}

/** Update a project the user owns. Trims inputs; `name` (when provided) must be
 *  non-empty and ≤ NAME_MAX, `description` ≤ DESCRIPTION_MAX (empty string clears
 *  it to null). Returns the updated summary, or null when the project isn't the
 *  user's or doesn't exist. Callers validate at the HTTP boundary; this guards
 *  ownership and persists. The `database` is injectable for persistence tests. */
export async function updateProject(
  userId: string,
  projectId: string,
  fields: { name?: string; description?: string | null },
  database: Database = db,
): Promise<ProjectSummary | null> {
  if (!(await userOwnsProject(userId, projectId, database))) return null;

  const patch: { name?: string; description?: string | null } = {};
  if (fields.name !== undefined) patch.name = fields.name.trim();
  if (fields.description !== undefined) {
    const trimmed = (fields.description ?? '').trim();
    patch.description = trimmed === '' ? null : trimmed;
  }
  if (Object.keys(patch).length === 0) return null;

  const [row] = await database
    .update(projects)
    .set(patch)
    .where(eq(projects.id, projectId))
    .returning({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
    });
  return row ?? null;
}

/** Delete a project the user owns (cascades its sessions). Returns false when the
 *  project doesn't exist or isn't theirs. Sandbox teardown is handled by the
 *  caller via the orchestrator — this only removes the DB rows. */
export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  if (!(await userOwnsProject(userId, projectId))) return false;
  await db.delete(projects).where(eq(projects.id, projectId));
  return true;
}
