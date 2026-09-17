import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE } from '@wintel/types';

import { ScansModule } from '../scans/scans.module';
import { AuditsController } from './audits.controller';
import { AuditsRepository } from './audits.repository';
import { AuditsService } from './audits.service';
import { ScanAuditQueueService } from './scan-audit-queue.service';

/** Wires auditing for the API: reads, the rule catalog, and admin re-runs through the audit queue. */
@Module({
  imports: [ScansModule, BullModule.registerQueue({ name: SCAN_AUDIT_QUEUE })],
  controllers: [AuditsController],
  providers: [AuditsService, AuditsRepository, ScanAuditQueueService],
})
export class AuditsModule {}
