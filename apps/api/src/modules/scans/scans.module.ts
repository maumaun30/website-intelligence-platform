import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBSITE_CRAWL_QUEUE } from '@wintel/types';

import { WebsitesModule } from '../websites/websites.module';
import { ScansController } from './scans.controller';
import { ScansRepository } from './scans.repository';
import { ScansService } from './scans.service';
import { WebsiteCrawlQueueService } from './website-crawl-queue.service';

/** Wires scanning: HTTP surface, rules, org-scoped data access, and the crawl queue producer. */
@Module({
  imports: [WebsitesModule, BullModule.registerQueue({ name: WEBSITE_CRAWL_QUEUE })],
  controllers: [ScansController],
  providers: [ScansService, ScansRepository, WebsiteCrawlQueueService],
})
export class ScansModule {}
