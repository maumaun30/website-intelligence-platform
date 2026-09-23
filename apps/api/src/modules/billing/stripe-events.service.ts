import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import { type OrganizationPlan, type SubscriptionStatus, evaluatePlanChange } from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { BillingRepository } from './billing.repository';
import type { StripeWebhookEvent } from './stripe/stripe-client';
import { planForPriceId } from './stripe/stripe-prices';
import { SubscriptionsRepository } from './subscriptions.repository';

// `customer.subscription.created` arrives alongside a completed checkout and carries the price,
// so it is handled identically to `customer.subscription.updated`. `checkout.session.completed`
// carries no price at all on a real Stripe session — it only attaches the subscription id.
const HANDLED = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
] as const;

const PLAN_BEARING_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
] as const;

// Finding 1: only these three describe one Stripe subscription object's lifecycle, in order.
// They are the sole stream allowed to consult or advance `lastEventAt`. `checkout.session.completed`
// and the invoice events are independent facts on a shared customer — they neither read nor write
// the watermark, so a session delivered before its slightly-older subscription.created cannot
// strand that event (and the plan it carries) behind a stale check.
const SUBSCRIPTION_LIFECYCLE_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

function readString(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Turns a verified Stripe event into our state. The only code that moves `Organization.plan`.
 * Unhandled types, unknown customers and stale deliveries all end here quietly with no write —
 * Stripe must get a 200 for them, because retrying cannot help.
 */
@Injectable()
export class StripeEventsService {
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly billing: BillingRepository,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async applyEvent(event: StripeWebhookEvent): Promise<void> {
    if (!(HANDLED as readonly string[]).includes(event.type)) {
      return;
    }

    const object = event.data.object;
    const customerId = readString(object, 'customer');
    if (!customerId) {
      return;
    }

    const existing = await this.subscriptions.findByCustomer(customerId);
    if (!existing) {
      return;
    }

    const eventCreated = new Date(event.created * 1000);
    const isSubscriptionLifecycleEvent = (
      SUBSCRIPTION_LIFECYCLE_TYPES as readonly string[]
    ).includes(event.type);
    // Stripe retries can arrive out of order; a stale update must not undo a newer one. Only the
    // subscription lifecycle stream consults the watermark — see Finding 1 above.
    if (
      isSubscriptionLifecycleEvent &&
      existing.lastEventAt &&
      existing.lastEventAt > eventCreated
    ) {
      return;
    }

    const plan = this.planFor(event, object);
    const downgradedWebsiteIds = plan
      ? evaluatePlanChange({
          plan,
          websites: await this.billing.listWebsiteFrequencies(existing.organizationId),
        }).frequencyDowngrades
      : [];

    const currentPeriodEnd = this.periodEnd(object);
    const cancelAtPeriodEnd = this.cancelAtPeriodEndFor(object);
    const status = this.statusFor(event, object);
    const stripeSubscriptionId = this.subscriptionIdFor(
      event,
      object,
      existing.stripeSubscriptionId,
    );

    await this.subscriptions.applyStripeState({
      eventId: event.id,
      eventType: event.type,
      // Finding 1: only the subscription lifecycle stream advances the watermark.
      ...(isSubscriptionLifecycleEvent ? { eventCreated } : {}),
      organizationId: existing.organizationId,
      stripeCustomerId: customerId,
      // Finding 4: an invoice event carries no subscription id of its own — omit the key rather
      // than echoing back `existing.stripeSubscriptionId`, a value read outside this transaction
      // that could be stale by the time this write lands.
      ...(stripeSubscriptionId === undefined ? {} : { stripeSubscriptionId }),
      // Finding 2: a checkout session carries no subscription status of its own.
      ...(status === undefined ? {} : { status }),
      ...(plan ? { plan } : {}),
      ...(event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_succeeded'
        ? {}
        : {
            // Ruling B: a checkout session carries neither field. Omitting the key (rather than
            // sending null) tells the repository to leave the stored value untouched.
            ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
            ...(cancelAtPeriodEnd === undefined ? {} : { cancelAtPeriodEnd }),
          }),
      downgradedWebsiteIds,
    });
  }

  /**
   * Only subscription-shaped events move the plan; invoice events never do. A checkout session
   * that carries no price (the normal case) yields `undefined`, so no plan is written until the
   * `customer.subscription.created` that follows it arrives.
   */
  private planFor(
    event: StripeWebhookEvent,
    object: Record<string, unknown>,
  ): OrganizationPlan | undefined {
    if (event.type === 'customer.subscription.deleted') {
      return 'free';
    }
    if (!(PLAN_BEARING_TYPES as readonly string[]).includes(event.type)) {
      return undefined;
    }
    const items = object['items'] as { data?: { price?: { id?: string } }[] } | undefined;
    const priceId = items?.data?.[0]?.price?.id;
    if (!priceId) {
      return undefined;
    }
    return planForPriceId(this.env, priceId) ?? undefined;
  }

  private statusFor(
    event: StripeWebhookEvent,
    object: Record<string, unknown>,
  ): SubscriptionStatus | undefined {
    if (event.type === 'customer.subscription.deleted') {
      return 'canceled';
    }
    if (event.type === 'invoice.payment_failed') {
      return 'past_due';
    }
    if (event.type === 'invoice.payment_succeeded') {
      return 'active';
    }
    // Finding 2: a checkout session's own `status` ("complete"/"open"/"expired") is not a
    // subscription status at all — omit the key rather than writing a guessed `incomplete` that
    // could regress a real `active`. The subscription event that follows carries the real status.
    if (event.type === 'checkout.session.completed') {
      return undefined;
    }
    // Never assume `active`: a card needing authentication arrives `incomplete`.
    const status = readString(object, 'status');
    return status === 'active' ||
      status === 'trialing' ||
      status === 'past_due' ||
      status === 'canceled' ||
      status === 'incomplete'
      ? status
      : 'incomplete';
  }

  /**
   * Finding 4: the invoice events (the `undefined` fallthrough below) carry no subscription id of
   * their own — returning `undefined` tells the caller to omit the key rather than echo back
   * `current`, a value read outside the transaction that could be stale by write time.
   */
  private subscriptionIdFor(
    event: StripeWebhookEvent,
    object: Record<string, unknown>,
    current: string | null,
  ): string | null | undefined {
    if (event.type === 'customer.subscription.deleted') {
      return null;
    }
    if (event.type === 'checkout.session.completed') {
      return readString(object, 'subscription') ?? current;
    }
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      return readString(object, 'id') ?? current;
    }
    return undefined;
  }

  private periodEnd(object: Record<string, unknown>): Date | undefined {
    const value = object['current_period_end'];
    return typeof value === 'number' ? new Date(value * 1000) : undefined;
  }

  private cancelAtPeriodEndFor(object: Record<string, unknown>): boolean | undefined {
    const value = object['cancel_at_period_end'];
    return typeof value === 'boolean' ? value : undefined;
  }
}
