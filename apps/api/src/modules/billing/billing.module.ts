import { Module } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import Stripe from 'stripe';

import { API_ENV } from '../../config/api-config.module';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { FakeStripeClient } from './stripe/fake-stripe-client';
import { LiveStripeClient } from './stripe/live-stripe-client';
import { STRIPE_CLIENT, type StripeClient } from './stripe/stripe-client';

function createStripeClient(env: ApiEnv): StripeClient {
  if (env.STRIPE_PROVIDER === 'fake') {
    return new FakeStripeClient();
  }
  return new LiveStripeClient(new Stripe(env.STRIPE_SECRET_KEY!), env.STRIPE_WEBHOOK_SECRET!);
}

/** Plan state plus the quota gate every other feature module imports. */
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    { provide: STRIPE_CLIENT, inject: [API_ENV], useFactory: createStripeClient },
  ],
  exports: [BillingService, STRIPE_CLIENT],
})
export class BillingModule {}
