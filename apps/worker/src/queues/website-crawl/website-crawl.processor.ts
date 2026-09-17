import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { WEBSITE_CRAWL_QUEUE, type WebsiteCrawlJob, websiteCrawlJobSchema } from '@wintel/types';
import type { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ScanAuditQueueService } from '../scan-audit/scan-audit-queue.service';
import type { CrawlResult, CrawlSink } from './crawl-runner';
import { CrawlWriter } from './crawl-writer';

export const CRAWL_RUNNER_FACTORY = Symbol('CRAWL_RUNNER_FACTORY');
export type CrawlRunnerFactory = (sink: CrawlSink) => {
  run(job: WebsiteCrawlJob): Promise<CrawlResult>;
};

/**
 * Owns a scan's lifecycle around the crawl. The `queued` → `running` claim is a conditional update,
 * so a job BullMQ re-delivers after a stall is ignored instead of crawling the site twice into the
 * same scan. Any throw marks the scan `failed` and is rethrown so BullMQ records it; the job was
 * enqueued with a single attempt, so it is never retried. On success it creates the scan's audit
 * before marking the scan completed — so a completed scan always has one — then enqueues it.
 */
@Processor(WEBSITE_CRAWL_QUEUE)
export class WebsiteCrawlProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CRAWL_RUNNER_FACTORY) private readonly createRunner: CrawlRunnerFactory,
    private readonly auditQueue: ScanAuditQueueService,
    @InjectPinoLogger(WebsiteCrawlProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data = websiteCrawlJobSchema.parse(job.data);
    const scans = this.prisma.client.scan;

    const { count } = await scans.updateMany({
      where: { id: data.scanId, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });
    if (count === 0) {
      this.logger.warn({ scanId: data.scanId }, 'Skipping crawl job for a scan that is not queued');
      return;
    }

    const writer = new CrawlWriter(this.prisma.client, data.scanId);
    try {
      const result = await this.createRunner(writer).run(data);
      await writer.flush();
      const audit = await this.auditQueue.createQueuedAudit(data.scanId, data.organizationId);
      await scans.update({
        where: { id: data.scanId },
        data: {
          status: 'completed',
          stopReason: result.stopReason,
          finishedAt: new Date(),
          pagesCrawled: result.pagesCrawled,
          pagesFailed: result.pagesFailed,
        },
      });
      await writer.pruneOlderContent(data.websiteId);
      this.logger.info({ scanId: data.scanId, ...result }, 'Crawl completed');

      try {
        await this.auditQueue.enqueue(audit);
      } catch (enqueueError) {
        this.logger.error(
          { scanId: data.scanId, auditId: audit.id, err: enqueueError },
          'Could not enqueue the audit of a completed scan',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await writer.flush();
      } catch (flushError) {
        this.logger.warn(
          { scanId: data.scanId, err: flushError },
          'Could not flush pages of a failed crawl',
        );
      }
      await scans.update({
        where: { id: data.scanId },
        data: {
          status: 'failed',
          error: message,
          finishedAt: new Date(),
          pagesCrawled: writer.pagesCrawled,
          pagesFailed: writer.pagesFailed,
        },
      });
      this.logger.error({ scanId: data.scanId, err: error }, 'Crawl failed');
      throw error;
    }
  }
}
