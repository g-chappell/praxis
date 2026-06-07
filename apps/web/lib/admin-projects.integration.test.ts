// Persistence tests for the admin projects directory (STORY-44). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/admin-projects.integration

import { randomUUID } from 'node:crypto';

import { projects, sessions, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { adminListProjects } from './admin-projects';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb, name: string): Promise<{ id: string; email: string }> {
  const email = `${name}-${randomUUID()}@example.test`;
  const [u] = await db
    .insert(users)
    .values({ email, displayName: name })
    .returning({ id: users.id });
  return { id: u!.id, email };
}

/** A team owned by `ownerId` with one project + the owner as a member. */
async function seedProject(db: TestDb, ownerId: string, name: string): Promise<string> {
  const [team] = await db
    .insert(teams)
    .values({ name: `${name}-team`, createdBy: ownerId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: ownerId });
  const [project] = await db
    .insert(projects)
    .values({ teamId: team!.id, name, templateId: 'react-threejs-scene', createdBy: ownerId })
    .returning({ id: projects.id, teamId: projects.teamId });
  return project!.id;
}

describeDb('adminListProjects (real DB)', () => {
  it('returns every project regardless of owner, with owner + member count + last activity', async () => {
    await withDb(async (db) => {
      const ada = await seedUser(db, 'Ada');
      const linus = await seedUser(db, 'Linus');
      const adaProject = await seedProject(db, ada.id, 'Ada Scene');
      const linusProject = await seedProject(db, linus.id, 'Linus Scene');

      // Add a second member to Ada's team and a session for last-activity.
      const [adaTeam] = await db
        .select({ teamId: projects.teamId })
        .from(projects)
        .where(eq(projects.id, adaProject));
      await db.insert(teamMemberships).values({ teamId: adaTeam!.teamId, userId: linus.id });
      await db.insert(sessions).values({ projectId: adaProject });

      const rows = await adminListProjects({}, db);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(adaProject);
      expect(ids).toContain(linusProject); // not Ada's — admin sees all owners

      const adaRow = rows.find((r) => r.id === adaProject)!;
      expect(adaRow.ownerEmail).toBe(ada.email);
      expect(adaRow.ownerName).toBe('Ada');
      expect(adaRow.memberCount).toBe(2); // Ada + Linus
      expect(adaRow.lastActivityAt).not.toBeNull();

      const linusRow = rows.find((r) => r.id === linusProject)!;
      expect(linusRow.memberCount).toBe(1);
      expect(linusRow.lastActivityAt).toBeNull(); // no sessions
    });
  });

  it('searches by name or owner, and filters by status', async () => {
    await withDb(async (db) => {
      const ada = await seedUser(db, 'Ada');
      const active = await seedProject(db, ada.id, 'Bright Cube');
      const archived = await seedProject(db, ada.id, 'Old Cube');
      await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, archived));

      // Search by project name.
      expect((await adminListProjects({ q: 'bright' }, db)).map((r) => r.id)).toEqual([active]);
      // Search by owner email matches both of Ada's projects.
      const byOwner = await adminListProjects({ q: ada.email }, db);
      expect(byOwner.map((r) => r.id).sort()).toEqual([active, archived].sort());
      // Status filter.
      expect((await adminListProjects({ status: 'active' }, db)).map((r) => r.id)).toContain(
        active,
      );
      expect((await adminListProjects({ status: 'active' }, db)).map((r) => r.id)).not.toContain(
        archived,
      );
      expect((await adminListProjects({ status: 'archived' }, db)).map((r) => r.id)).toEqual([
        archived,
      ]);
    });
  });
});
