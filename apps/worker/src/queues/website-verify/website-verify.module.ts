import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBSITE_VERIFY_QUEUE } from '@wintel/types';

import { DnsVerificationStrategy } from './dns-strategy';
import { MetaVerificationStrategy } from './meta-strategy';
import { WebsiteVerifyProcessor } from './website-verify.processor';

/** Strategies are plain classes, so they are provided by factory rather than constructor injection. */
@Module({
  imports: [BullModule.registerQueue({ name: WEBSITE_VERIFY_QUEUE })],
  providers: [
    WebsiteVerifyProcessor,
    { provide: DnsVerificationStrategy, useFactory: () => new DnsVerificationStrategy() },
    { provide: MetaVerificationStrategy, useFactory: () => new MetaVerificationStrategy() },
  ],
})
export class WebsiteVerifyModule {}
