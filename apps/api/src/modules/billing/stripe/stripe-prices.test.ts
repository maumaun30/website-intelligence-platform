import { describe, expect, it } from 'vitest';

import { planForPriceId, priceIdForPlan } from './stripe-prices';

const env = { STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_AGENCY: 'price_agency' } as never;

describe('planForPriceId', () => {
  it('maps each configured price to its plan', () => {
    expect(planForPriceId(env, 'price_pro')).toBe('pro');
    expect(planForPriceId(env, 'price_agency')).toBe('agency');
  });

  it('returns null for a price we do not sell', () => {
    expect(planForPriceId(env, 'price_unknown')).toBeNull();
  });
});

describe('priceIdForPlan', () => {
  it('returns the configured price', () => {
    expect(priceIdForPlan(env, 'pro')).toBe('price_pro');
  });
});
