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
    // Stripe retries can arrive out of order; a stale update must not undo a newer one.
    if (existing.lastEventAt && existing.lastEventAt > eventCreated) {
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

    await this.subscriptions.applyStripeState({
      eventId: event.id,
      eventType: event.type,
      eventCreated,
      organizationId: existing.organizationId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: this.subscriptionIdFor(event, object, existing.stripeSubscriptionId),
      status: this.statusFor(event, object),
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
  ): SubscriptionStatus {
    if (event.type === 'customer.subscription.deleted') {
      return 'canceled';
    }
    if (event.type === 'invoice.payment_failed') {
      return 'past_due';
    }
    if (event.type === 'invoice.payment_succeeded') {
      return 'active';
    }
    // Never assume `active`: a card needing authentication arrives `incomplete`, and a checkout
    // session's own `status` ("complete"/"open"/"expired") is not a subscription status either —
    // it falls through to `incomplete` until the subscription event that follows corrects it.
    const status = readString(object, 'status');
    return status === 'active' ||
      status === 'trialing' ||
      status === 'past_due' ||
      status === 'canceled' ||
      status === 'incomplete'
      ? status
      : 'incomplete';
  }

  private subscriptionIdFor(
    event: StripeWebhookEvent,
    object: Record<string, unknown>,
    current: string | null,
  ): string | null {
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
    return current;
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
