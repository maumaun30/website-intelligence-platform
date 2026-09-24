import type { ApiError } from './api-client';
import { BillingRequestError } from './billing-client';

/**
 * Turns a refused billing request into something a person can act on. Anything unrecognised gets
 * the generic line rather than a raw status or code.
 */
export function refusalMessage(error: ApiError | null | undefined): string | null {
  if (!error) {
    return null;
  }
  if (error.status === 403) {
    return 'Only an owner can manage billing.';
  }
  if (error instanceof BillingRequestError) {
    switch (error.code) {
      case 'SUBSCRIPTION_EXISTS':
        return 'You already have a subscription. Use Manage billing to change it.';
      case 'NO_SUBSCRIPTION':
        return 'You do not have a billing account yet.';
      case 'STRIPE_UNAVAILABLE':
        return 'Could not reach Stripe. Try again in a moment.';
      default:
        break;
    }
  }
  return 'Something went wrong. Try again.';
}
