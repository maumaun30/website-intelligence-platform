import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type PageListQuery,
  type ScanStartRefusal,
  effectivePageCap,
  evaluateScanStart,
} from '@wintel/types';

import { BillingService } from '../billing/billing.service';
import { WebsitesService } from '../websites/websites.service';
import { ScansRepository } from './scans.repository';
import { WebsiteCrawlQueueService } from './website-crawl-queue.service';

const REFUSAL_MESSAGES: Record<ScanStartRefusal, string> = {
  WEBSITE_NOT_VERIFIED: 'Verify ownership of this website before scanning it',
  SCAN_IN_PROGRESS: 'A scan of this website is already in progress',
};

/** Scan business rules: ownership via the website, verification, one active scan, enqueue. */
@Injectable()
export class ScansService {
  constructor(
    private readonly repo: ScansRepository,
    private readonly websites: WebsitesService,
    private readonly crawlQueue: WebsiteCrawlQueueService,
    private readonly billing: BillingService,
  ) {}

  async start(websiteId: string, organizationId: string, now: Date = new Date()) {
    const website = await this.websites.getOrThrow(websiteId, organizationId);

    const decision = evaluateScanStart({
      verificationStatus: website.verificationStatus,
      activeScan: await this.repo.findActiveForWebsite(websiteId, organizationId),
      now,
    });

    if (decision.action === 'refuse') {
      throw new ConflictException({
        message: REFUSAL_MESSAGES[decision.code],
        details: { code: decision.code },
      });
    }
    if (decision.staleScanId !== null) {
      await this.repo.markFailed(
        decision.staleScanId,
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
      maxPages: effectivePageCap(await this.billing.planFor(organizationId), website.maxPages),
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
