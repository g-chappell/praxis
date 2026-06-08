// Per-turn usage metering (STORY-22). Records a usage_events row from each
// completed agent turn (the token usage AcpHost surfaces on turn-complete,
// ADR-0009), attributed to project + session. Best-effort: a metering failure
// must never break the turn.

import { usageEvents } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import { logger } from './logger';

// Estimated cost ONLY — ACP doesn't expose the agent's model, so we apply a
// documented list rate (USD per 1M tokens). Assumes Claude Sonnet-class pricing;
// revisit if the model or pricing changes. The estimate is recorded per row so
// historical rows keep the rate they were costed at.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK
  );
}

/** Record a completed turn's token usage. Best-effort — logs and swallows on
 *  failure so a metering hiccup never fails the turn. The `database` is
 *  injectable for persistence tests. */
export async function recordTurnUsage(
  projectId: string,
  sessionId: string,
  usage: { inputTokens: number; outputTokens: number },
  database: Database = db,
): Promise<void> {
  try {
    const cost = estimateCostUsd(usage.inputTokens, usage.outputTokens);
    await database.insert(usageEvents).values({
      projectId,
      sessionId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost.toFixed(6),
    });
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'usage.record_failed',
    );
  }
}
