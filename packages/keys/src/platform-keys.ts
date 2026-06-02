// Platform Anthropic API key management (ADR-0009 / STORY-21). The platform-owned
// key that powers all agent sessions lives encrypted in platform_api_keys; this
// module is the only place that encrypts on write and decrypts on read. A single
// key is active at a time — setting a new one deactivates the prior (retained for
// audit).
//
// Lives in @praxis/keys (not apps/web/lib) so both the web admin UI and the
// orchestrator (which calls getActivePlatformKey at agent-spawn time, STORY-09)
// can import it.

import { eq } from 'drizzle-orm';

import { decrypt, encrypt } from '@praxis/crypto';
import { platformApiKeys } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

/** Thrown by getActivePlatformKey when no active key is configured. Loud on
 *  purpose — a session cannot run without it (ADR-0009). */
export class NoPlatformKeyError extends Error {
  constructor() {
    super('No active platform API key is configured');
    this.name = 'NoPlatformKeyError';
  }
}

/** Display-safe metadata about the active key. Never carries the raw key. */
export interface PlatformKeyMeta {
  maskedKey: string;
  createdAt: Date | null;
  lastRotatedAt: Date | null;
}

/** Mask a key for display: keep the provider prefix and last 4, hide the rest.
 *  e.g. `sk-ant-…AB12`. Pure (no I/O) so it's unit-testable. */
export function maskKey(raw: string): string {
  const last4 = raw.slice(-4);
  if (raw.length <= 8) return `…${last4}`;
  return `${raw.slice(0, 7)}…${last4}`;
}

/**
 * Set the active platform API key (first-set or rotation). In one transaction:
 * deactivate any current active key (kept for audit), then insert the new one as
 * active. The raw key is encrypted before it touches the DB and never logged.
 */
export async function setActivePlatformKey(
  rawKey: string,
  createdById: string,
  db: Database = defaultDb,
): Promise<void> {
  const keyEncrypted = await encrypt(rawKey);
  await db.transaction(async (tx) => {
    await tx.update(platformApiKeys).set({ active: false }).where(eq(platformApiKeys.active, true));
    await tx.insert(platformApiKeys).values({
      keyEncrypted,
      active: true,
      createdBy: createdById,
      lastRotatedAt: new Date(),
    });
  });
}

/**
 * Return the decrypted active platform API key for server-side consumers (the
 * orchestrator at agent-spawn time). Throws {@link NoPlatformKeyError} when none
 * is configured. Server-side only — never expose the result to a client.
 */
export async function getActivePlatformKey(db: Database = defaultDb): Promise<string> {
  const [row] = await db
    .select()
    .from(platformApiKeys)
    .where(eq(platformApiKeys.active, true))
    .limit(1);
  if (!row) throw new NoPlatformKeyError();
  return decrypt(row.keyEncrypted);
}

/** Display-safe metadata for the active key, or null when none is set. Decrypts
 *  only to compute the mask; never returns the raw key. */
export async function getActivePlatformKeyMeta(
  db: Database = defaultDb,
): Promise<PlatformKeyMeta | null> {
  const [row] = await db
    .select()
    .from(platformApiKeys)
    .where(eq(platformApiKeys.active, true))
    .limit(1);
  if (!row) return null;
  const raw = await decrypt(row.keyEncrypted);
  return { maskedKey: maskKey(raw), createdAt: row.createdAt, lastRotatedAt: row.lastRotatedAt };
}
