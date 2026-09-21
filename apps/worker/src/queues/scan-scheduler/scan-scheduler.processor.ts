import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ACTIVE_SCAN_STATUSES,
  PLAN_LIMITS,
  SCAN_SCHEDULER_QUEUE,
  SCHEDULER_BATCH_SIZE,
  WEBSITE_CRAWL_QUEUE,
  type WebsiteCrawlJob,
  computeNextScanAt,
  effectivePageCap,
  evaluateScanStart,
} from '@wintel/types';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type DueWebsite = Awaited<ReturnType<ScanSchedulerProcessor['findDue']>>[number];

export interface TickSummary {
  due: number;
  started: number;
  skipped: number;
  failed: number;
}

/**
 * Starts scheduled scans. Each tick claims due websites by conditionally advancing `nextScanAt` —
 * before deciding whether to scan — so concurrent ticks never double-start and downtime never
 * produces a burst of catch-up scans. Start rules are the shared `evaluateScanStart`.
 */
@Processor(SCAN_SCHEDULER_QUEUE)
export class ScanSchedulerProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBSITE_CRAWL_QUEUE) private readonly crawlQueue: Queue<WebsiteCrawlJob>,
    @InjectPinoLogger(ScanSchedulerProcessor.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(): Promise<TickSummary> {
    return this.runTick(new Date());
  }

  async runTick(now: Date): Promise<TickSummary> {
    const due = await this.findDue(now);
    const summary: TickSummary = { due: due.length, started: 0, skipped: 0, failed: 0 };

    for (const website of due) {
      try {
        if (await this.startScheduledScan(website, now)) {
          summary.started++;
        } else {
          summary.skipped++;
        }
      } catch (error) {
        summary.failed++;
        this.logger.error(
          { websiteId: website.id, err: error },
          'Could not start a scheduled scan',
        );
      }
    }

    if (summary.due > 0) {
      this.logger.info(summary, 'Scheduler tick');
    }
    return summary;
  }

  async findDue(now: Date) {
    return this.prisma.client.website.findMany({
      where: {
        verificationStatus: 'verified',
        scanFrequency: { not: 'manual' },
        nextScanAt: { lte: now },
      },
      orderBy: { nextScanAt: 'asc' },
      take: SCHEDULER_BATCH_SIZE,
      include: { organization: { select: { plan: true } } },
    });
  }

  private async startScheduledScan(website: DueWebsite, now: Date): Promise<boolean> {
    const client = this.prisma.client;

    const { count } = await client.website.updateMany({
      where: { id: website.id, nextScanAt: website.nextScanAt },
      data: { nextScanAt: computeNextScanAt(website.scanFrequency, now) },
    });
    if (count === 0) {
      return false;
    }

    // An organization can downgrade between ticks: a schedule the plan no longer allows stops here
    // and falls back to manual rather than silently running on.
    if (!PLAN_LIMITS[website.organization.plan].scanFrequencies.includes(website.scanFrequency)) {
      await client.website.updateMany({
        where: { id: website.id },
        data: { scanFrequency: 'manual', nextScanAt: null },
      });
      return false;
    }

    const activeScan = await client.scan.findFirst({
      where: { websiteId: website.id, status: { in: [...ACTIVE_SCAN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    const decision = evaluateScanStart({
      verificationStatus: website.verificationStatus,
      activeScan,
      now,
    });
    if (decision.action === 'refuse') {
      return false;
    }
    if (decision.staleScanId !== null) {
      await client.scan.update({
        where: { id: decision.staleScanId },
        data: {
          status: 'failed',
          error: 'Scan did not finish before the deadline',
          finishedAt: now,
        },
      });
    }

    const scan = await client.scan.create({
      data: { websiteId: website.id, organizationId: website.organizationId, trigger: 'scheduled' },
    });
    await this.crawlQueue.add(
      'crawl',
      {
        scanId: scan.id,
        websiteId: website.id,
        organizationId: website.organizationId,
        url: website.url,
        domain: website.domain,
        maxDepth: website.maxDepth,
        maxPages: effectivePageCap(website.organization.plan, website.maxPages),
        includePaths: website.includePaths,
        excludePaths: website.excludePaths,
        respectRobotsTxt: website.respectRobotsTxt,
      },
      { attempts: 1 },
    );
    return true;
  }
}
