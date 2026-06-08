// Project usage summary (STORY-22). Cumulative token usage + estimated cost from
// usage_events, owner-scoped (team membership — same gate as archive/delete). The
// orchestrator records the per-turn rows (ADR-0009).

import { eq, sql } from 'drizzle-orm';

import { usageEvents } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import { userOwnsProject } from './projects';

export interface ProjectUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  turns: number;
}

/** Cumulative usage for a project the user is a member of, or null when they
 *  aren't (or it doesn't exist). The `database` is injectable for tests. */
export async function projectUsage(
  userId: string,
  projectId: string,
  database: Database = db,
): Promise<ProjectUsage | null> {
  if (!(await userOwnsProject(userId, projectId, database))) return null;

  const [row] = await database
    .select({
      inputTokens: sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
      estimatedCostUsd: sql<string>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`,
      turns: sql<number>`count(*)::int`,
    })
    .from(usageEvents)
    .where(eq(usageEvents.projectId, projectId));

  return {
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    estimatedCostUsd: Number(row?.estimatedCostUsd ?? 0),
    turns: row?.turns ?? 0,
  };
}
