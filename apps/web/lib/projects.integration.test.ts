// Persistence tests for project rename / re-describe (STORY-39). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/projects.integration

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { projects, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { updateProject } from './projects';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `proj-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  return u!.id;
}

/** A team owned by `ownerId` with one project; returns ids for assertions. */
async function seedTeamWithProject(db: TestDb, ownerId: string) {
  const [team] = await db
    .insert(teams)
    .values({ name: 'T', createdBy: ownerId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: ownerId });
  const [project] = await db
    .insert(projects)
    .values({ teamId: team!.id, name: 'P', templateId: 'react-threejs-scene', createdBy: ownerId })
    .returning({ id: projects.id, createdAt: projects.createdAt });
  return { teamId: team!.id, projectId: project!.id, createdAt: project!.createdAt };
}

describeDb('updateProject (real DB)', () => {
  it('owner renames and re-describes; trims and preserves createdAt', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId, createdAt } = await seedTeamWithProject(db, owner);

      const updated = await updateProject(
        owner,
        projectId,
        { name: '  Renamed  ', description: '  a scene  ' },
        db,
      );

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Renamed');
      expect(updated!.description).toBe('a scene');
      // createdAt is immutable across an update.
      expect(updated!.createdAt?.getTime()).toBe(createdAt?.getTime());
    });
  });

  it('an empty description clears it to null', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      await updateProject(owner, projectId, { description: 'temp' }, db);
      const cleared = await updateProject(owner, projectId, { description: '   ' }, db);

      expect(cleared).not.toBeNull();
      expect(cleared!.description).toBeNull();
    });
  });

  it('a non-member cannot update the project (returns null, no write)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      const result = await updateProject(stranger, projectId, { name: 'Hijacked' }, db);
      expect(result).toBeNull();

      // The original name is untouched.
      const after = await updateProject(owner, projectId, { name: 'P' }, db);
      expect(after!.name).toBe('P');
    });
  });

  it('an empty field set is a no-op (returns null)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      const result = await updateProject(owner, projectId, {}, db);
      expect(result).toBeNull();
    });
  });
});
