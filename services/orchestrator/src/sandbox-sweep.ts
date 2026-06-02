// Idle-sandbox sweep (project_plan.md §6): every 60s, stop sandboxes with no
// exec/spawn activity for 30 min. stop() snapshots the project to MinIO first
// (when MINIO_* is configured). Bun-only — wired from index.ts, never the Node
// test path.

import { IdleSweeper } from '@praxis/sandbox';

import { logger } from './logger';
import { getSandbox } from './runtime';

/** Start the idle sweep. Returns a stop function. Resilient: Docker/MinIO
 *  errors are logged, never fatal. Shares the process-wide DockerSandbox with
 *  the session runtime so persistence config is identical. */
export function startIdleSweep(): () => void {
  const sandbox = getSandbox();
  const sweeper = new IdleSweeper(sandbox, {
    onStop: (projectId) => logger.info({ projectId }, 'sandbox.idle_stopped'),
  });
  logger.info('sandbox.idle_sweep_start');
  return sweeper.start(60_000, (err) =>
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'sandbox.sweep_failed'),
  );
}
