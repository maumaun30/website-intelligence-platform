import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBSITE_VERIFY_QUEUE } from '@wintel/types';

import { WebsiteVerifyQueueService } from './website-verify-queue.service';
import { WebsitesController } from './websites.controller';
import { WebsitesRepository } from './websites.repository';
import { WebsitesService } from './websites.service';

/** Wires the website feature: HTTP surface, business logic, tenant-scoped data access, verify queue. */
@Module({
  imports: [BullModule.registerQueue({ name: WEBSITE_VERIFY_QUEUE })],
  controllers: [WebsitesController],
  providers: [WebsitesService, WebsitesRepository, WebsiteVerifyQueueService],
})
export class WebsitesModule {}
