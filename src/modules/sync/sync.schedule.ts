// Runs the synchronization at once and then every interval. A failed run is
// reported and the schedule keeps going, so the next interval is the retry.

interface SyncScheduleOptions {
  run: () => Promise<unknown>;
  intervalMs: number;
  onError?: (error: unknown) => void;
}

export interface SyncSchedule {
  /** Stops the timers and settles when the run in progress has finished. */
  stop(): Promise<void>;
}

export function startSyncSchedule({
  run,
  intervalMs,
  onError,
}: SyncScheduleOptions): SyncSchedule {
  const inFlight = new Set<Promise<void>>();

  const tick = () => {
    const current = run()
      .then(() => undefined)
      .catch((error: unknown) => {
        onError?.(error);
      })
      .finally(() => {
        inFlight.delete(current);
      });
    inFlight.add(current);
  };
  const first = setTimeout(tick, 0);
  const every = setInterval(tick, intervalMs);

  return {
    async stop() {
      clearTimeout(first);
      clearInterval(every);
      await Promise.all(inFlight);
    },
  };
}
