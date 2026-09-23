import type { ApiEnv } from '@wintel/config';
import type { OrganizationPlan, PurchasablePlan } from '@wintel/types';

/** The one place price ids meet plans. `free` has no price and never appears here. */
export function planForPriceId(env: ApiEnv, priceId: string): OrganizationPlan | null {
  if (priceId === env.STRIPE_PRICE_PRO) {
    return 'pro';
  }
  if (priceId === env.STRIPE_PRICE_AGENCY) {
    return 'agency';
  }
  return null;
}

export function priceIdForPlan(env: ApiEnv, plan: PurchasablePlan): string {
  const priceId = plan === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_AGENCY;
  if (!priceId) {
    throw new Error(`No Stripe price configured for the ${plan} plan`);
  }
  return priceId;
}
