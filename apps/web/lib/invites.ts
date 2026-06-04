// Project sharing via single-use invite links (STORY-31). An owner mints a code
// bound to their project's team; whoever redeems it joins that team and thereby
// gains access to its projects (userOwnsProject is team-scoped). Built on the
// existing team_invites table — no schema change. Single-use: the claim is an
// atomic conditional UPDATE so concurrent redemptions can't both win.

import { randomBytes } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { projects, teamInvites, teamMemberships } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

/** Caller isn't a member of the project's team — they can't mint an invite. */
export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

interface Deps {
  /** Injectable for tests; defaults to the lazy @praxis/db/client singleton. */
  db?: Database;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreatedInvite {
  code: string;
  expiresAt: Date;
}

/** Mint a single-use, 7-day invite for the project's team. Throws
 *  {@link ForbiddenError} when the caller isn't a member of that team. */
export async function createInvite(
  userId: string,
  projectId: string,
  { db = defaultDb }: Deps = {},
): Promise<CreatedInvite> {
  const [row] = await db
    .select({ teamId: projects.teamId })
    .from(projects)
    .innerJoin(teamMemberships, eq(teamMemberships.teamId, projects.teamId))
    .where(and(eq(projects.id, projectId), eq(teamMemberships.userId, userId)))
    .limit(1);
  if (!row) throw new ForbiddenError();

  const code = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(teamInvites).values({ teamId: row.teamId, inviteCode: code, expiresAt });
  return { code, expiresAt };
}

export type AcceptResult =
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'ok'; teamId: string; projectId: string | null; alreadyMember: boolean };

/** Redeem an invite code for a user. Validates the code, no-ops if they're
 *  already on the team (without consuming it), else atomically claims the
 *  single-use invite and adds the membership. */
export async function acceptInvite(
  userId: string,
  code: string,
  { db = defaultDb }: Deps = {},
): Promise<AcceptResult> {
  const [invite] = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.inviteCode, code))
    .limit(1);
  if (!invite) return { status: 'invalid' };
  if (invite.expiresAt.getTime() < Date.now()) return { status: 'expired' };
  if (invite.acceptedBy && invite.acceptedBy !== userId) return { status: 'used' };

  const teamId = invite.teamId;
  const projectId = await newestProjectId(db, teamId);

  // Already on the team (e.g. the owner opening their own link, or a re-open by
  // the original acceptor): no write, and don't consume the code.
  if (await isMember(db, teamId, userId)) {
    return { status: 'ok', teamId, projectId, alreadyMember: true };
  }

  // Claim the single-use invite atomically: only the redemption that flips
  // accepted_by from NULL proceeds to add the membership. A concurrent loser
  // gets no row back.
  const claimed = await db
    .update(teamInvites)
    .set({ acceptedBy: userId })
    .where(and(eq(teamInvites.id, invite.id), isNull(teamInvites.acceptedBy)))
    .returning({ id: teamInvites.id });

  if (claimed.length === 0) {
    // Lost the race. If we somehow ended up as the acceptor, fall through as a
    // member; otherwise someone else took the single use.
    const [after] = await db
      .select({ acceptedBy: teamInvites.acceptedBy })
      .from(teamInvites)
      .where(eq(teamInvites.id, invite.id))
      .limit(1);
    if (after?.acceptedBy !== userId) return { status: 'used' };
  }

  await db.insert(teamMemberships).values({ teamId, userId }).onConflictDoNothing();
  return { status: 'ok', teamId, projectId, alreadyMember: false };
}

async function isMember(db: Database, teamId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** The team's newest project, used as the post-accept landing target. */
async function newestProjectId(db: Database, teamId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(projects.createdAt))
    .limit(1);
  return row?.id ?? null;
}
