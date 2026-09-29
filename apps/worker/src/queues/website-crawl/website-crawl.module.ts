import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBSITE_CRAWL_QUEUE } from '@wintel/types';

import { GUARDED_FETCH } from '../../infrastructure/network/guarded-fetch.module';
import { ScanAuditModule } from '../scan-audit/scan-audit.module';
import { CrawlRunner } from './crawl-runner';
import { PageFetcher } from './page-fetcher';
import { loadRobotsTxt } from './robots-txt';
import {
  CRAWL_RUNNER_FACTORY,
  type CrawlRunnerFactory,
  WebsiteCrawlProcessor,
} from './website-crawl.processor';

const createRunnerWith =
  (guardedFetch: typeof fetch): CrawlRunnerFactory =>
  (sink) =>
    new CrawlRunner({
      fetcher: new PageFetcher(guardedFetch),
      loadRobots: (origin) => loadRobotsTxt(origin, guardedFetch),
      sink,
    });

/** A factory rather than a singleton runner: each scan gets its own sink and crawl state. */
@Module({
  imports: [ScanAuditModule, BullModule.registerQueue({ name: WEBSITE_CRAWL_QUEUE })],
  providers: [
    WebsiteCrawlProcessor,
    {
      provide: CRAWL_RUNNER_FACTORY,
      inject: [GUARDED_FETCH],
      useFactory: createRunnerWith,
    },
  ],
})
export class WebsiteCrawlModule {}
