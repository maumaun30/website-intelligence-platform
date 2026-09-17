import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE, type ScanAuditJob } from '@wintel/types';
import { Queue } from 'bullmq';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Lets the crawl processor hand a finished scan to the auditor. Creating the audit row and adding
 * the job are separate steps so the row can exist before the scan is marked completed.
 */
@Injectable()
export class ScanAuditQueueService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCAN_AUDIT_QUEUE) private readonly queue: Queue<ScanAuditJob>,
  ) {}

  createQueuedAudit(scanId: string, organizationId: string) {
    return this.prisma.client.audit.upsert({
      where: { scanId },
      create: { scanId, organizationId },
      update: {
        status: 'queued',
        criticalCount: 0,
        warningCount: 0,
        noticeCount: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
      select: { id: true, scanId: true },
    });
  }

  async enqueue(audit: { id: string; scanId: string }): Promise<void> {
    await this.queue.add('audit', { auditId: audit.id, scanId: audit.scanId }, { attempts: 1 });
  }
}
