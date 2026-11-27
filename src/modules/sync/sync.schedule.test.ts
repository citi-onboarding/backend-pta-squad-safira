import { afterEach, describe, expect, it, vi } from "vitest";

import { startSyncSchedule } from "./sync.schedule.js";

const HOUR = 60 * 60 * 1000;

describe("startSyncSchedule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs at once and then every interval until stopped", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({ skipped: false });

    const schedule = startSyncSchedule({ run, intervalMs: HOUR });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run).toHaveBeenCalledTimes(2);

    schedule.stop();
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps running after a failed run, so the next hour retries", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("database down"))
      .mockResolvedValue({ skipped: false });

    const schedule = startSyncSchedule({ run, intervalMs: HOUR, onError });
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    schedule.stop();
  });
});
