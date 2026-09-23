import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FakeStripeClient } from './stripe/fake-stripe-client';
import { SubscriptionsService } from './subscriptions.service';

const env = {
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_AGENCY: 'price_agency',
  APP_URL: 'http://localhost:3000',
} as never;

const make = (repo: Partial<Record<string, unknown>>) =>
  new SubscriptionsService(
    {
      find: vi.fn().mockResolvedValue(null),
      upsertCustomer: vi.fn().mockResolvedValue(undefined),
      ...repo,
    } as never,
    new FakeStripeClient(),
    env,
  );

describe('SubscriptionsService.checkout', () => {
  it('creates a customer and returns a checkout url for a first subscription', async () => {
    const upsertCustomer = vi.fn().mockResolvedValue(undefined);
    const service = make({ upsertCustomer });

    const result = await service.checkout('o1', 'pro', 'owner@example.com');

    expect(result.url).toBe('https://stripe.test/checkout/o1');
    expect(upsertCustomer).toHaveBeenCalledWith('o1', 'cus_fake_o1', 'pro');
  });

  it('reuses an existing stripe customer', async () => {
    const upsertCustomer = vi.fn().mockResolvedValue(undefined);
    const service = make({
      find: vi.fn().mockResolvedValue({
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: null,
        status: 'canceled',
      }),
      upsertCustomer,
    });

    await service.checkout('o1', 'agency', 'owner@example.com');

    expect(upsertCustomer).not.toHaveBeenCalled();
  });

  it('refuses when an active subscription already exists', async () => {
    const service = make({
      find: vi.fn().mockResolvedValue({
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      }),
    });

    await expect(service.checkout('o1', 'pro', 'owner@example.com')).rejects.toMatchObject({
      response: { details: { code: 'SUBSCRIPTION_EXISTS' } },
    });
  });
});

describe('SubscriptionsService.portal', () => {
  it('returns a portal url for a subscriber', async () => {
    const service = make({
      find: vi.fn().mockResolvedValue({
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      }),
    });

    expect((await service.portal('o1')).url).toBe('https://stripe.test/portal/cus_existing');
  });

  it('refuses when the organization has never subscribed', async () => {
    const service = make({});

    await expect(service.portal('o1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.portal('o1')).rejects.toMatchObject({
      response: { details: { code: 'NO_SUBSCRIPTION' } },
    });
  });
});
