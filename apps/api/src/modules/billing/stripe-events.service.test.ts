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

  // Finding 1: only customer.subscription.* consults or advances the lastEventAt watermark.
  // Stripe does not guarantee delivery order and the subscription object is typically created
  // slightly before the checkout session completes, so a session delivered first must not strand
  // a strictly-earlier subscription.created event that carries the plan.
  it('does not let a checkout session watermark block an earlier subscription.created event', async () => {
    let lastEventAt: Date | null = null;
    const applyStripeState = vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
      if (typeof input['eventCreated'] !== 'undefined') {
        lastEventAt = input['eventCreated'] as Date;
      }
      return true;
    });
    const findByCustomer = vi.fn().mockImplementation(async () => ({
      organizationId: 'o1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
      lastEventAt,
    }));
    const service = new StripeEventsService(
      { findByCustomer, applyStripeState } as never,
      { listWebsiteFrequencies: vi.fn().mockResolvedValue([]) } as never,
      env,
    );

    // T: the checkout session completes.
    await service.applyEvent(checkoutEvent({}, 2_000));
    // T-1: the subscription object, created slightly earlier, carries the pro price.
    await service.applyEvent(subscriptionEvent('customer.subscription.created', {}, 1_000));

    expect(applyStripeState).toHaveBeenCalledTimes(2);
    const secondCall = applyStripeState.mock.calls[1]![0] as { plan?: string };
    expect(secondCall.plan).toBe('pro');
  });

  // Finding 2: a checkout session's own status ('complete'/'open'/'expired') is not a subscription
  // status and must not overwrite a real 'active' status with 'incomplete'.
  it('does not regress an active status when a checkout session follows a subscription update', async () => {
    let status: string | undefined;
    const applyStripeState = vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
      if (typeof input['status'] !== 'undefined') {
        status = input['status'] as string;
      }
      return true;
    });
    const findByCustomer = vi.fn().mockResolvedValue({
      organizationId: 'o1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
      lastEventAt: null,
    });
    const service = new StripeEventsService(
      { findByCustomer, applyStripeState } as never,
      { listWebsiteFrequencies: vi.fn().mockResolvedValue([]) } as never,
      env,
    );

    await service.applyEvent(
      subscriptionEvent('customer.subscription.updated', { status: 'active' }),
    );
    await service.applyEvent(checkoutEvent());

    expect(status).toBe('active');
  });

  // Finding 4: an invoice event carries no subscription id of its own. Echoing back the value
  // read outside the transaction (`existing.stripeSubscriptionId`) re-writes a possibly-stale
  // value; omit the key instead, exactly as Ruling B omits the period fields.
  it('omits the stripeSubscriptionId key for an invoice event, which carries no subscription id of its own', async () => {
    const { service, applyStripeState } = make({
      findByCustomer: vi.fn().mockResolvedValue({
        organizationId: 'o1',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_current',
        lastEventAt: null,
      }),
    });

    await service.applyEvent(subscriptionEvent('invoice.payment_succeeded'));

    const written = applyStripeState.mock.calls[0]![0] as Record<string, unknown>;
    expect('stripeSubscriptionId' in written).toBe(false);
  });
});

// Stripe's 2026-08-26 API moved `current_period_end` off the subscription and onto each item.
// Verified live: a real `customer.subscription.created` carries no top-level field at all.
describe('StripeEventsService period end', () => {
  it('reads the period end from the subscription items when the top level has none', async () => {
    const { service, applyStripeState } = make();
    const event = subscriptionEvent('customer.subscription.updated', {
      current_period_end: undefined,
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1_792_804_461 }] },
    });

    await service.applyEvent(event as never);

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: new Date(1_792_804_461 * 1000) }),
    );
  });

  it('prefers the top-level field when an older API version still sends it', async () => {
    const { service, applyStripeState } = make();
    const event = subscriptionEvent('customer.subscription.updated', {
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1_792_804_461 }] },
    });

    await service.applyEvent(event as never);

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: new Date(1_760_000_000 * 1000) }),
    );
  });

  it('takes the furthest item period end when items disagree', async () => {
    const { service, applyStripeState } = make();
    const event = subscriptionEvent('customer.subscription.updated', {
      current_period_end: undefined,
      items: {
        data: [
          { price: { id: 'price_pro' }, current_period_end: 1_700_000_000 },
          { price: { id: 'price_pro' }, current_period_end: 1_792_804_461 },
        ],
      },
    });

    await service.applyEvent(event as never);

    expect(applyStripeState).toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: new Date(1_792_804_461 * 1000) }),
    );
  });
});
