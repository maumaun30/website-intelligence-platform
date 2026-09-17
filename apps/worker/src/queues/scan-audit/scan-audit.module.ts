import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE } from '@wintel/types';

import { AUDIT_CONTEXT_LOADER, loadAuditContext } from './audit-context-loader';
import { ScanAuditQueueService } from './scan-audit-queue.service';
import { ScanAuditProcessor } from './scan-audit.processor';

/** Consumes audit jobs, and exports the producer the crawl module uses to start them. */
@Module({
  imports: [BullModule.registerQueue({ name: SCAN_AUDIT_QUEUE })],
  providers: [
    ScanAuditProcessor,
    ScanAuditQueueService,
    { provide: AUDIT_CONTEXT_LOADER, useValue: loadAuditContext },
  ],
  exports: [ScanAuditQueueService],
})
export class ScanAuditModule {}
