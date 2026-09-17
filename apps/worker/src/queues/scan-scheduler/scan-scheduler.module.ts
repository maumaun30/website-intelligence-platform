import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_SCHEDULER_QUEUE, WEBSITE_CRAWL_QUEUE } from '@wintel/types';

import { ScanSchedulerProcessor } from './scan-scheduler.processor';
import { ScanSchedulerRegistrar } from './scan-scheduler.registrar';

/** The scheduler tick: registers it, consumes it, and produces crawl jobs for due websites. */
@Module({
  imports: [
    BullModule.registerQueue({ name: SCAN_SCHEDULER_QUEUE }),
    BullModule.registerQueue({ name: WEBSITE_CRAWL_QUEUE }),
  ],
  providers: [ScanSchedulerProcessor, ScanSchedulerRegistrar],
})
export class ScanSchedulerModule {}
