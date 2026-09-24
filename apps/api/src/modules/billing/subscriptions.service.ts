import { BadGatewayException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@wintel/config';
import type { PurchasablePlan } from '@wintel/types';

import { API_ENV } from '../../config/api-config.module';
import { STRIPE_CLIENT, type StripeClient } from './stripe/stripe-client';
import { priceIdForPlan } from './stripe/stripe-prices';
import { SubscriptionsRepository } from './subscriptions.repository';

/** Statuses that mean "already paying"; changing plan is then the Portal's job, not checkout's. */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

/**
 * Creates the hosted Stripe sessions. It never writes a plan: only webhooks do that, so an
 * abandoned checkout leaves nothing behind but a Stripe customer.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repo: SubscriptionsRepository,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async checkout(
    organizationId: string,
    plan: PurchasablePlan,
    email: string,
  ): Promise<{ url: string }> {
    const existing = await this.repo.find(organizationId);

    if (
      existing?.stripeSubscriptionId &&
      (LIVE_STATUSES as readonly string[]).includes(existing.status)
    ) {
      throw new ConflictException({
        message: 'This organization already has a subscription; manage it in the billing portal',
        details: { code: 'SUBSCRIPTION_EXISTS' },
      });
    }

    // Resolved before any Stripe call: a missing price is our misconfiguration, and reporting it
    // as "could not reach Stripe" would send someone hunting an outage that never happened.
    const priceId = priceIdForPlan(this.env, plan);

    const customerId =
      existing?.stripeCustomerId ??
      (await this.call(() => this.stripe.createCustomer({ organizationId, email })));

    if (!existing) {
      await this.repo.upsertCustomer(organizationId, customerId, plan);
    }

    const url = await this.call(() =>
      this.stripe.createCheckoutSession({
        customerId,
        priceId,
        organizationId,
        successUrl: `${this.env.APP_URL}/dashboard/billing?checkout=success`,
        cancelUrl: `${this.env.APP_URL}/dashboard/billing?checkout=cancelled`,
      }),
    );

    return { url };
  }

  async portal(organizationId: string): Promise<{ url: string }> {
    const existing = await this.repo.find(organizationId);
    if (!existing) {
      throw new ConflictException({
        message: 'This organization has no billing account yet',
        details: { code: 'NO_SUBSCRIPTION' },
      });
    }

    const url = await this.call(() =>
      this.stripe.createPortalSession({
        customerId: existing.stripeCustomerId,
        returnUrl: `${this.env.APP_URL}/dashboard/billing`,
      }),
    );

    return { url };
  }

  /** Stripe being unreachable is a 502, not a 500: nothing of ours is broken. */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadGatewayException({
        message: 'Could not reach Stripe. Try again in a moment.',
        details: { code: 'STRIPE_UNAVAILABLE' },
      });
    }
  }
}
