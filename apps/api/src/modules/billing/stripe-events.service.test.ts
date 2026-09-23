import { describe, expect, it, vi } from 'vitest';

import { StripeEventsService } from './stripe-events.service';

const env = { STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_AGENCY: 'price_agency' } as never;

const subscriptionEvent = (
  type: string,
  overrides: Record<string, unknown> = {},
  created = 2_000,
) => ({
  id: `evt_${type}_${created}`,
  type,
  created,
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_760_000_000,
      items: { data: [{ price: { id: 'price_pro' } }] },
      metadata: { organizationId: 'o1' },
      ...overrides,
    },
  },
});

// Ruling A: a real checkout.session.completed carries no `items`/price — only session-shaped
// fields. Its job is attaching the subscription id, never the plan.
const checkoutEvent = (overrides: Record<string, unknown> = {}, created = 2_000) => ({
  id: `evt_checkout_${created}`,
  type: 'checkout.session.completed',
  created,
  data: {
    object: {
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      client_reference_id: 'o1',
      status: 'complete',
      metadata: { organizationId: 'o1' },
      ...overrides,
    },
  },
});

const make = (repo: Partial<Record<string, unknown>> = {}) => {
  const applyStripeState = vi.fn().mockResolvedValue(true);
  const service = new StripeEventsService(
    {
      findByCustomer: vi.fn().mockResolvedValue({
        organizationId: 'o1',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: null,
        lastEventAt: null,
      }),
      applyStripeState,
      ...repo,
    } as never,
    { listWebsiteFrequencies: vi.fn().mockResolvedValue([]) } as never,
    env,
  );
  return { service, applyStripeState };
};

describe('StripeEventsService.applyEvent', () => {
  it('attaches the subscription id from a completed checkout and writes no plan', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(checkoutEvent());

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'o1', stripeSubscriptionId: 'sub_1' }),
    );
    const written = applyStripeState.mock.calls[0]![0] as { plan?: string };
    expect(written.plan).toBeUndefined();
  });

  it('sets the plan from the price when a subscription is created', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(subscriptionEvent('customer.subscription.created'));

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'o1', plan: 'pro' }),
    );
  });

  it('drops the plan to free when the subscription is deleted', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(subscriptionEvent('customer.subscription.deleted'));

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'free', status: 'canceled' }),
    );
  });

  it('keeps the plan on a failed payment and only marks it past_due', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(
      subscriptionEvent('invoice.payment_failed', { subscription: 'sub_1' }),
    );

    const written = applyStripeState.mock.calls[0]![0] as { plan?: string; status: string };
    expect(written.status).toBe('past_due');
    expect(written.plan).toBeUndefined();
  });

  it('ignores an event older than the last one applied', async () => {
    const { service, applyStripeState } = make({
      findByCustomer: vi.fn().mockResolvedValue({
        organizationId: 'o1',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: null,
        lastEventAt: new Date(3_000 * 1000),
      }),
    });

    await service.applyEvent(subscriptionEvent('customer.subscription.updated', {}, 2_000));

    expect(applyStripeState).not.toHaveBeenCalled();
  });

  it('ignores an event type it does not handle', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(subscriptionEvent('customer.created'));

    expect(applyStripeState).not.toHaveBeenCalled();
  });

  it('ignores an event for a customer we do not know', async () => {
    const { service, applyStripeState } = make({
      findByCustomer: vi.fn().mockResolvedValue(null),
    });

    await service.applyEvent(subscriptionEvent('customer.subscription.updated'));

    expect(applyStripeState).not.toHaveBeenCalled();
  });

  it('passes the downgraded website ids for a plan drop', async () => {
    const applyStripeState = vi.fn().mockResolvedValue(true);
    const service = new StripeEventsService(
      {
        findByCustomer: vi.fn().mockResolvedValue({
          organizationId: 'o1',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: null,
          lastEventAt: null,
        }),
        applyStripeState,
      } as never,
      {
        listWebsiteFrequencies: vi.fn().mockResolvedValue([{ id: 'w1', scanFrequency: 'daily' }]),
      } as never,
      env,
    );

    await service.applyEvent(subscriptionEvent('customer.subscription.deleted'));

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ downgradedWebsiteIds: ['w1'] }),
    );
  });

  // Ruling B: a checkout.session.completed carries no period fields at all. Applying it after a
  // subscription event must not send a value that would null out what is already stored.
  it('omits the period fields for a checkout session that carries none', async () => {
    const { service, applyStripeState } = make();

    await service.applyEvent(checkoutEvent());

    const written = applyStripeState.mock.calls[0]![0] as Record<string, unknown>;
    expect('currentPeriodEnd' in written).toBe(false);
    expect('cancelAtPeriodEnd' in written).toBe(false);
  });
});
