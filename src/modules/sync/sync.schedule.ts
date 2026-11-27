// Runs the synchronization at once and then every interval. A failed run is
// reported and the schedule keeps going, so the next interval is the retry.

interface SyncScheduleOptions {
  run: () => Promise<unknown>;
  intervalMs: number;
  onError?: (error: unknown) => void;
}

export interface SyncSchedule {
  stop(): void;
}

export function startSyncSchedule({
  run,
  intervalMs,
  onError,
}: SyncScheduleOptions): SyncSchedule {
  const tick = () => {
    run().catch((error: unknown) => {
      onError?.(error);
    });
  };
  const first = setTimeout(tick, 0);
  const every = setInterval(tick, intervalMs);

  return {
    stop() {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
