import { Module } from '@nestjs/common';

import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';

/** Plan state plus the quota gate every other feature module imports. */
@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService],
})
export class BillingModule {}
