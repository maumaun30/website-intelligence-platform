import { z } from 'zod';

import { billingPlanStateSchema } from './billing';

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Statuses that mean "this organization is subscribed right now". `incomplete` (checkout started
 * but never paid) and `canceled` are rows that exist without a live subscription behind them, so
 * both the API's "already subscribed" check and the UI's "offer to subscribe" decision must read
 * this list rather than the mere existence of a Subscription row.
 */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

export function isLiveSubscription(status: SubscriptionStatus | null | undefined): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '');
}

/** Plans that can be bought. `free` has no price, so it can never be checked out. */
export const PURCHASABLE_PLANS = ['pro', 'agency'] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export const createCheckoutInputSchema = z.object({ plan: z.enum(PURCHASABLE_PLANS) });

export const subscriptionSummarySchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

/** What the checkout and portal endpoints return: a hosted Stripe URL to redirect to. */
export const billingRedirectSchema = z.object({ url: z.url() });

/** The full `GET /billing` body: slice 8's plan state plus the subscription behind it. */
export const billingStateSchema = billingPlanStateSchema.extend({
  subscription: subscriptionSummarySchema.nullable(),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutInputSchema>;
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;
export type BillingRedirect = z.infer<typeof billingRedirectSchema>;
export type BillingState = z.infer<typeof billingStateSchema>;
