// Persistence tests for the platform key service. Real Postgres (tier-3 rule:
// no DB mocks), gated behind RUN_DB_TESTS=1. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/platform-keys.integration

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { _resetKeyCacheForTests } from '@praxis/crypto';
import { platformApiKeys, users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';

import { NoPlatformKeyError, getActivePlatformKey, setActivePlatformKey } from './platform-keys';

// 32 fixed bytes, base64 — a real key shape for @praxis/crypto.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('platform-keys (real DB)', () => {
  let userId: string;

  beforeAll(async () => {
    process.env.PRAXIS_MASTER_KEY = TEST_KEY;
    _resetKeyCacheForTests();
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      const [u] = await db
        .insert(users)
        .values({ email: `pk-test-${randomUUID()}@example.com` })
        .returning({ id: users.id });
      userId = u!.id;
    });
  });

  afterAll(async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await db.delete(users).where(eq(users.id, userId));
    });
  });

  it('set → getActivePlatformKey round-trips the raw key (stored encrypted)', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-test-AAAA', userId, db);

      const [row] = await db.select().from(platformApiKeys).where(eq(platformApiKeys.active, true));
      expect(row!.keyEncrypted).not.toBe('sk-ant-test-AAAA'); // ciphertext, not raw
      expect(await getActivePlatformKey(db)).toBe('sk-ant-test-AAAA');
    });
  });

  it('rotation activates the new key and retains the prior one inactive', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-old-AAAA', userId, db);
      await setActivePlatformKey('sk-ant-new-BBBB', userId, db);

      expect(await getActivePlatformKey(db)).toBe('sk-ant-new-BBBB');
      const rows = await db.select().from(platformApiKeys);
      expect(rows.length).toBe(2); // old retained for audit
      expect(rows.filter((r) => r.active).length).toBe(1); // exactly one active
    });
  });

  it('getActivePlatformKey throws NoPlatformKeyError when none is set', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await expect(getActivePlatformKey(db)).rejects.toBeInstanceOf(NoPlatformKeyError);
    });
  });
});
