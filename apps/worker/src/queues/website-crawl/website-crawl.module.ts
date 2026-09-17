import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBSITE_CRAWL_QUEUE } from '@wintel/types';

import { ScanAuditModule } from '../scan-audit/scan-audit.module';
import { CrawlRunner } from './crawl-runner';
import { PageFetcher } from './page-fetcher';
import { loadRobotsTxt } from './robots-txt';
import {
  CRAWL_RUNNER_FACTORY,
  type CrawlRunnerFactory,
  WebsiteCrawlProcessor,
} from './website-crawl.processor';

const createRunner: CrawlRunnerFactory = (sink) =>
  new CrawlRunner({
    fetcher: new PageFetcher(),
    loadRobots: (origin) => loadRobotsTxt(origin),
    sink,
  });

/** A factory rather than a singleton runner: each scan gets its own sink and crawl state. */
@Module({
  imports: [ScanAuditModule, BullModule.registerQueue({ name: WEBSITE_CRAWL_QUEUE })],
  providers: [WebsiteCrawlProcessor, { provide: CRAWL_RUNNER_FACTORY, useValue: createRunner }],
})
export class WebsiteCrawlModule {}
