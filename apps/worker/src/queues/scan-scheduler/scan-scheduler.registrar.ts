import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { SCAN_SCHEDULER_QUEUE, SCHEDULER_JOB_ID, SCHEDULER_TICK_MS } from '@wintel/types';
import { Queue } from 'bullmq';

/**
 * Ensures the scheduler tick exists. `upsertJobScheduler` with a fixed id is idempotent, so every
 * worker can call it on boot and there is still exactly one tick; it also restores the tick after a
 * Redis flush. The schedule itself lives in Postgres.
 */
@Injectable()
export class ScanSchedulerRegistrar implements OnApplicationBootstrap {
  constructor(@InjectQueue(SCAN_SCHEDULER_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SCHEDULER_JOB_ID,
      { every: SCHEDULER_TICK_MS },
      {
        name: 'tick',
        opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
      },
    );
  }
}
