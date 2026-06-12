// Persistence tests for team create / get / rename (STORY-54). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/teams.integration

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { auditLog, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { createTeam, getTeamForUser, renameTeam } from './teams';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb, displayName?: string): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `team-${randomUUID()}@example.test`, displayName: displayName ?? null })
    .returning({ id: users.id });
  return u!.id;
}

describeDb('createTeam (real DB)', () => {
  it('creates a team with the creator as owner member', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db, 'Ada');
      const result = await createTeam(owner, '  Acme  ', db);
      expect('team' in result).toBe(true);
      if (!('team' in result)) return;

      expect(result.team.name).toBe('Acme');
      expect(result.team.isOwner).toBe(true);
      expect(result.team.members).toHaveLength(1);
      expect(result.team.members[0]).toMatchObject({
        userId: owner,
        displayName: 'Ada',
        isOwner: true,
      });
      expect(result.team.members[0]!.joinedAt).toBeInstanceOf(Date);
    });
  });

  it('returns already_in_team when the user already belongs to one', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      await createTeam(owner, 'First', db);
      expect(await createTeam(owner, 'Second', db)).toEqual({ error: 'already_in_team' });
    });
  });

  it('rejects an empty or too-long name without inserting', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      expect(await createTeam(owner, '   ', db)).toEqual({ error: 'invalid_name' });
      expect(await createTeam(owner, 'a'.repeat(61), db)).toEqual({ error: 'invalid_name' });
      expect(await getTeamForUser(owner, db)).toBeNull();
    });
  });
});

describeDb('getTeamForUser (real DB)', () => {
  it('returns null when the user has no team', async () => {
    await withDb(async (db) => {
      const user = await seedUser(db);
      expect(await getTeamForUser(user, db)).toBeNull();
    });
  });

  it('reflects ownership per viewer and lists the owner first', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db, 'Owner');
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      const partner = await seedUser(db, 'Partner');
      await db.insert(teamMemberships).values({ teamId: created.team.id, userId: partner });

      const fromOwner = await getTeamForUser(owner, db);
      expect(fromOwner!.isOwner).toBe(true);
      expect(fromOwner!.members.map((m) => m.userId)).toEqual([owner, partner]);
      expect(fromOwner!.members.find((m) => m.userId === owner)!.isOwner).toBe(true);
      expect(fromOwner!.members.find((m) => m.userId === partner)!.isOwner).toBe(false);

      const fromPartner = await getTeamForUser(partner, db);
      expect(fromPartner!.id).toBe(created.team.id);
      expect(fromPartner!.isOwner).toBe(false);
    });
  });
});

describeDb('renameTeam (real DB)', () => {
  it('owner renames; persists and writes a team.renamed audit row', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      const result = await renameTeam(owner, created.team.id, '  Acme Labs  ', db);
      expect('team' in result && result.team.name).toBe('Acme Labs');

      const [row] = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, created.team.id));
      expect(row!.name).toBe('Acme Labs');

      const audits = await db
        .select({ action: auditLog.action, targetId: auditLog.targetId })
        .from(auditLog)
        .where(eq(auditLog.targetId, created.team.id));
      expect(audits).toContainEqual({ action: 'team.renamed', targetId: created.team.id });
    });
  });

  it('returns not_owner for a non-owner and does not change the name', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      const stranger = await seedUser(db);
      expect(await renameTeam(stranger, created.team.id, 'Hijacked', db)).toEqual({
        error: 'not_owner',
      });
      const [row] = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, created.team.id));
      expect(row!.name).toBe('Acme');
    });
  });

  it('rejects an empty or too-long name and reports a missing team', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      expect(await renameTeam(owner, created.team.id, '   ', db)).toEqual({
        error: 'invalid_name',
      });
      expect(await renameTeam(owner, created.team.id, 'a'.repeat(61), db)).toEqual({
        error: 'invalid_name',
      });
      expect(await renameTeam(owner, randomUUID(), 'Ghost', db)).toEqual({ error: 'not_found' });
    });
  });
});
