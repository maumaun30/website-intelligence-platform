import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type PageListQuery, SCAN_DEADLINE_MS } from '@wintel/types';

import { WebsitesService } from '../websites/websites.service';
import { ScansRepository } from './scans.repository';
import { WebsiteCrawlQueueService } from './website-crawl-queue.service';

interface ActiveScan {
  id: string;
  status: string;
  startedAt: Date | null;
}

/**
 * A `running` scan whose worker died never reaches a terminal state on its own. Once it has run
 * longer than the worker's own deadline it cannot still be alive, so it must not block new scans.
 * A `queued` scan is never stale: it may simply be waiting behind other websites' crawls.
 */
function isStale(scan: ActiveScan, now: Date): boolean {
  return (
    scan.status === 'running' &&
    scan.startedAt !== null &&
    now.getTime() - scan.startedAt.getTime() > SCAN_DEADLINE_MS
  );
}

/** Scan business rules: ownership via the website, verification, one active scan, enqueue. */
@Injectable()
export class ScansService {
  constructor(
    private readonly repo: ScansRepository,
    private readonly websites: WebsitesService,
    private readonly crawlQueue: WebsiteCrawlQueueService,
  ) {}

  async start(websiteId: string, organizationId: string, now: Date = new Date()) {
    const website = await this.websites.getOrThrow(websiteId, organizationId);

    if (website.verificationStatus !== 'verified') {
      throw new ConflictException({
        message: 'Verify ownership of this website before scanning it',
        details: { code: 'WEBSITE_NOT_VERIFIED' },
      });
    }

    const active = await this.repo.findActiveForWebsite(websiteId, organizationId);
    if (active) {
      if (!isStale(active, now)) {
        throw new ConflictException({
          message: 'A scan of this website is already in progress',
          details: { code: 'SCAN_IN_PROGRESS' },
        });
      }
      await this.repo.markFailed(
        active.id,
        organizationId,
        'Scan did not finish before the deadline',
      );
    }

    const scan = await this.repo.createQueued({ websiteId, organizationId });
    await this.crawlQueue.enqueue({
      scanId: scan.id,
      websiteId,
      organizationId,
      url: website.url,
      domain: website.domain,
      maxDepth: website.maxDepth,
      maxPages: website.maxPages,
      includePaths: website.includePaths,
      excludePaths: website.excludePaths,
      respectRobotsTxt: website.respectRobotsTxt,
    });
    return scan;
  }

  async listForWebsite(websiteId: string, organizationId: string) {
    await this.websites.getOrThrow(websiteId, organizationId);
    return this.repo.listForWebsite(websiteId, organizationId);
  }

  async getOrThrow(id: string, organizationId: string) {
    const scan = await this.repo.findInOrg(id, organizationId);
    if (!scan) {
      throw new NotFoundException('Scan not found');
    }
    return scan;
  }

  async listPages(id: string, organizationId: string, query: PageListQuery) {
    const result = await this.repo.listPages(id, organizationId, query.limit, query.offset);
    if (!result) {
      throw new NotFoundException('Scan not found');
    }
    return { ...result, limit: query.limit, offset: query.offset };
  }
}
