// Team helpers (STORY-54). Teams are explicit: a user deliberately creates a
// named team (becoming its owner) or joins one via invite (STORY-55) — they are
// no longer auto-created on first project. Ownership is derived from
// teams.createdBy (no role column on team_memberships); one team per user this
// pass. The `database` is injectable for persistence tests; it defaults to the
// @praxis/db/client singleton.

import { asc, eq } from 'drizzle-orm';

import { teamMemberships, teams, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import { recordAudit } from '@/lib/audit';

/** Max team-name length, shared by the HTTP boundary and the create/rename form. */
export const TEAM_NAME_MAX = 60;

export interface TeamMember {
  userId: string;
  email: string;
  displayName: string | null;
  isOwner: boolean;
  joinedAt: Date | null;
}

export interface TeamForUser {
  id: string;
  name: string;
  isOwner: boolean;
  members: TeamMember[];
}

/** Validate an untrusted team name (pure — no DB): a non-empty string ≤
 *  TEAM_NAME_MAX after trim. Returns the trimmed name, or an error the caller
 *  maps to a 400. */
export function parseTeamName(value: unknown): { name: string } | { error: 'invalid_name' } {
  if (typeof value !== 'string') return { error: 'invalid_name' };
  const name = value.trim();
  if (!name || name.length > TEAM_NAME_MAX) return { error: 'invalid_name' };
  return { name };
}

/** The team the user belongs to (with its members), or null when they have none.
 *  A member is the owner iff they created the team. Members are oldest-joined
 *  first, so the owner (who joined at creation) leads the list. */
export async function getTeamForUser(
  userId: string,
  database: Database = db,
): Promise<TeamForUser | null> {
  const [membership] = await database
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .limit(1);
  if (!membership) return null;

  return getTeamById(membership.teamId, userId, database);
}

/** Hydrate a team + its members, computing `isOwner` for the viewer. Internal —
 *  callers reach a team through getTeamForUser / createTeam / renameTeam. */
async function getTeamById(
  teamId: string,
  viewerId: string,
  database: Database,
): Promise<TeamForUser | null> {
  const [team] = await database
    .select({ id: teams.id, name: teams.name, createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const rows = await database
    .select({
      userId: teamMemberships.userId,
      email: users.email,
      displayName: users.displayName,
      joinedAt: teamMemberships.joinedAt,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.teamId, teamId))
    .orderBy(asc(teamMemberships.joinedAt));

  const members: TeamMember[] = rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    displayName: r.displayName,
    isOwner: r.userId === team.createdBy,
    joinedAt: r.joinedAt,
  }));

  return { id: team.id, name: team.name, isOwner: team.createdBy === viewerId, members };
}

export type CreateTeamResult =
  | { team: TeamForUser }
  | { error: 'invalid_name' | 'already_in_team' };

/** Create a team owned by `userId` from an untrusted name. 409 (already_in_team)
 *  if the user already belongs to one — one team per user this pass; 400
 *  (invalid_name) if the name is empty/too long. On success the creator is the
 *  owner member. Sequential inserts (no transaction) match the codebase style. */
export async function createTeam(
  userId: string,
  rawName: unknown,
  database: Database = db,
): Promise<CreateTeamResult> {
  const parsed = parseTeamName(rawName);
  if ('error' in parsed) return { error: parsed.error };

  const [existing] = await database
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .limit(1);
  if (existing) return { error: 'already_in_team' };

  const [team] = await database
    .insert(teams)
    .values({ name: parsed.name, createdBy: userId })
    .returning({ id: teams.id });
  await database.insert(teamMemberships).values({ teamId: team!.id, userId });

  const hydrated = await getTeamById(team!.id, userId, database);
  return { team: hydrated! };
}

export type RenameTeamResult =
  | { team: TeamForUser }
  | { error: 'invalid_name' | 'not_owner' | 'not_found' };

/** Rename a team. Owner-gated: 403 (not_owner) for a non-owner, 404 (not_found)
 *  if the team is gone, 400 (invalid_name) for an empty/too-long name. Writes a
 *  team.renamed audit row on success. */
export async function renameTeam(
  userId: string,
  teamId: string,
  rawName: unknown,
  database: Database = db,
): Promise<RenameTeamResult> {
  const parsed = parseTeamName(rawName);
  if ('error' in parsed) return { error: parsed.error };

  const [team] = await database
    .select({ id: teams.id, createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { error: 'not_found' };
  if (team.createdBy !== userId) return { error: 'not_owner' };

  await database.update(teams).set({ name: parsed.name }).where(eq(teams.id, teamId));
  await recordAudit(
    userId,
    'team.renamed',
    { targetType: 'team', targetId: teamId, metadata: { name: parsed.name } },
    database,
  );

  const hydrated = await getTeamById(teamId, userId, database);
  return { team: hydrated! };
}
