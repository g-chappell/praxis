// Project + team helpers (STORY-09). A project needs a team (FK notNull); the POC
// gives each user an implicit "Personal" team on first project. Full team
// management is a later epic.

import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { projects, teamMemberships, teams } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | null;
  archivedAt: Date | null;
}

/** Which slice of a user's projects to list. Defaults to `active` everywhere. */
export type ProjectStatus = 'active' | 'archived' | 'all';

/** Narrow an untrusted ?status query value to a ProjectStatus (default active). */
export function parseProjectStatus(value: unknown): ProjectStatus {
  return value === 'archived' || value === 'all' ? value : 'active';
}

/** Sort order for the project list. Defaults to `recent` (newest first). */
export type ProjectSort = 'recent' | 'oldest' | 'name';

/** Narrow an untrusted ?sort query value to a ProjectSort (default recent). */
export function parseProjectSort(value: unknown): ProjectSort {
  return value === 'oldest' || value === 'name' ? value : 'recent';
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

/** All projects in the user's team(s). Defaults to active (un-archived),
 *  newest first; pass `status` to list archived-only or all (STORY-40) and
 *  `sort` to order by recent / oldest / name (STORY-41). */
export async function listUserProjects(
  userId: string,
  opts: { status?: ProjectStatus; sort?: ProjectSort } = {},
  database: Database = db,
): Promise<ProjectSummary[]> {
  const status = opts.status ?? 'active';
  const sort = opts.sort ?? 'recent';
  const archiveFilter =
    status === 'active'
      ? isNull(projects.archivedAt)
      : status === 'archived'
        ? isNotNull(projects.archivedAt)
        : undefined;
  const order =
    sort === 'oldest'
      ? asc(projects.createdAt)
      : sort === 'name'
        ? asc(projects.name)
        : desc(projects.createdAt);

  return database
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      archivedAt: projects.archivedAt,
    })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(and(eq(teamMemberships.userId, userId), archiveFilter))
    .orderBy(order);
}

/** Archive (`archive: true`) or restore (`archive: false`) a project the user
 *  owns. Sets/clears archived_at; the volume + sandbox are untouched (the idle
 *  sweep reaps any running container). Returns false when the project isn't the
 *  user's or doesn't exist. The `database` is injectable for persistence tests. */
export async function setProjectArchived(
  userId: string,
  projectId: string,
  archive: boolean,
  database: Database = db,
): Promise<boolean> {
  if (!(await userOwnsProject(userId, projectId, database))) return false;
  const [row] = await database
    .update(projects)
    .set({ archivedAt: archive ? new Date() : null })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return Boolean(row);
}

/** Whether a project is archived (STORY-52). Call AFTER an ownership/membership
 *  check — this only reads archived_at. Used to gate interaction (sessions are
 *  refused, the workspace renders read-only) for cold-stored projects. A missing
 *  project reads as not-archived (the ownership check already 403/404s it). */
export async function isProjectArchived(
  projectId: string,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return Boolean(row?.archivedAt);
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
      archivedAt: projects.archivedAt,
    });
  return row ?? null;
}

/** The widest budget an owner/admin can set, USD (STORY-23). A guardrail, not a
 *  business rule — keeps a fat-fingered value from disabling the cap entirely. */
export const BUDGET_MAX_USD = 100_000;

/** Validate an untrusted budget value: a finite number in [0, BUDGET_MAX_USD].
 *  Returns the normalized 2-decimal string, or null when invalid. */
export function parseBudgetUsd(value: unknown): string | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > BUDGET_MAX_USD) return null;
  return n.toFixed(2);
}

/** Set a project's budget (USD) — owner-gated (team membership). Returns false
 *  when the project isn't the user's or doesn't exist. The caller validates the
 *  value via parseBudgetUsd. The `database` is injectable for tests. */
export async function setProjectBudget(
  userId: string,
  projectId: string,
  budgetUsd: string,
  database: Database = db,
): Promise<boolean> {
  if (!(await userOwnsProject(userId, projectId, database))) return false;
  const [row] = await database
    .update(projects)
    .set({ budgetUsd })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  return Boolean(row);
}

/** Delete a project the user owns (cascades its sessions). Returns false when the
 *  project doesn't exist or isn't theirs. Sandbox teardown is handled by the
 *  caller via the orchestrator — this only removes the DB rows. */
export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  if (!(await userOwnsProject(userId, projectId))) return false;
  await db.delete(projects).where(eq(projects.id, projectId));
  return true;
}

/** Create a copy of a project the user owns: a new row in the same team, named
 *  "Copy of <name>", same template. Returns the new project's id + templateId
 *  (the caller triggers the sandbox clone via the orchestrator), or null when
 *  the source isn't the user's. The join enforces ownership. The `database` is
 *  injectable for persistence tests. */
export async function duplicateProjectRow(
  userId: string,
  sourceProjectId: string,
  database: Database = db,
): Promise<{ id: string; templateId: string } | null> {
  const [src] = await database
    .select({ name: projects.name, templateId: projects.templateId, teamId: projects.teamId })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(and(eq(projects.id, sourceProjectId), eq(teamMemberships.userId, userId)))
    .limit(1);
  if (!src) return null;

  const [row] = await database
    .insert(projects)
    .values({
      teamId: src.teamId,
      name: `Copy of ${src.name}`,
      templateId: src.templateId,
      createdBy: userId,
    })
    .returning({ id: projects.id });
  return { id: row!.id, templateId: src.templateId };
}
