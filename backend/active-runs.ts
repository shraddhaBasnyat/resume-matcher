/**
 * Module-level store for active graph runs, keyed by threadId.
 * Used to support user-initiated cancellation via the /api/match/cancel endpoint.
 *
 * Note: This is in-memory only. It resets on server restart and does not
 * survive across multiple instances (e.g. in a multi-replica deploy).
 */

interface ActiveRun {
  abort: () => void;
  runStartTime: number;
}

export const activeRuns = new Map<string, ActiveRun>();
