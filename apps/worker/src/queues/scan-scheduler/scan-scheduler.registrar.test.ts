import { SCHEDULER_JOB_ID, SCHEDULER_TICK_MS } from '@wintel/types';
import { describe, expect, it, vi } from 'vitest';

import { ScanSchedulerRegistrar } from './scan-scheduler.registrar';

describe('ScanSchedulerRegistrar', () => {
  it('upserts one repeating tick on startup', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    const registrar = new ScanSchedulerRegistrar({ upsertJobScheduler } as never);

    await registrar.onApplicationBootstrap();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      SCHEDULER_JOB_ID,
      { every: SCHEDULER_TICK_MS },
      expect.objectContaining({ name: 'tick' }),
    );
  });
});
