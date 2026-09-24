import { describe, expect, it } from 'vitest';

import { PLAN_LIMITS } from './billing';
import {
  PURCHASABLE_PLANS,
  billingStateSchema,
  isLiveSubscription,
  createCheckoutInputSchema,
  subscriptionSummarySchema,
} from './stripe';

const planState = {
  plan: 'pro' as const,
  limits: PLAN_LIMITS.pro,
  usage: { websites: 2, aiExplanationsThisMonth: 4 },
  plans: PLAN_LIMITS,
};

describe('PURCHASABLE_PLANS', () => {
  it('excludes free, which has no price', () => {
    expect(PURCHASABLE_PLANS).toEqual(['pro', 'agency']);
  });
});

describe('createCheckoutInputSchema', () => {
  it('accepts a purchasable plan', () => {
    expect(createCheckoutInputSchema.parse({ plan: 'pro' })).toEqual({ plan: 'pro' });
  });

  it('rejects free', () => {
    expect(createCheckoutInputSchema.safeParse({ plan: 'free' }).success).toBe(false);
  });
});

describe('subscriptionSummarySchema', () => {
  it('accepts a subscription with no period end', () => {
    expect(
      subscriptionSummarySchema.parse({
        status: 'incomplete',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }).status,
    ).toBe('incomplete');
  });

  it('rejects a status Stripe never sends us', () => {
    expect(
      subscriptionSummarySchema.safeParse({
        status: 'paused',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }).success,
    ).toBe(false);
  });
});

describe('billingStateSchema', () => {
  it('accepts a plan state with no subscription', () => {
    expect(billingStateSchema.parse({ ...planState, subscription: null }).subscription).toBeNull();
  });

  it('accepts a plan state with a subscription', () => {
    const parsed = billingStateSchema.parse({
      ...planState,
      subscription: {
        status: 'past_due',
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      },
    });

    expect(parsed.subscription!.status).toBe('past_due');
    expect(parsed.plan).toBe('pro');
  });

  it('requires the subscription field to be present', () => {
    expect(billingStateSchema.safeParse(planState).success).toBe(false);
  });
});

describe('isLiveSubscription', () => {
  it('counts only a subscription someone is actually paying for', () => {
    expect(isLiveSubscription('active')).toBe(true);
    expect(isLiveSubscription('trialing')).toBe(true);
    expect(isLiveSubscription('past_due')).toBe(true);
  });

  it('rejects rows left behind by an abandoned checkout or a cancellation', () => {
    expect(isLiveSubscription('incomplete')).toBe(false);
    expect(isLiveSubscription('canceled')).toBe(false);
    expect(isLiveSubscription(null)).toBe(false);
    expect(isLiveSubscription(undefined)).toBe(false);
  });
});
