import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { SCAN_AUDIT_QUEUE, type ScanAuditJob } from '@wintel/types';
import { Queue } from 'bullmq';

/** Producer for admin-initiated audit re-runs. Single attempt: a re-run can simply be re-run. */
@Injectable()
export class ScanAuditQueueService {
  constructor(@InjectQueue(SCAN_AUDIT_QUEUE) private readonly queue: Queue<ScanAuditJob>) {}

  async enqueue(job: ScanAuditJob): Promise<void> {
    await this.queue.add('audit', job, { attempts: 1 });
  }
}
