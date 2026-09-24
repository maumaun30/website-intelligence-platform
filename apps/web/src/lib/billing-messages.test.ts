import { describe, expect, it } from 'vitest';

import { ApiError } from './api-client';
import { BillingRequestError } from './billing-client';
import { refusalMessage } from './billing-messages';

describe('refusalMessage', () => {
  it('says nothing when nothing failed', () => {
    expect(refusalMessage(null)).toBeNull();
    expect(refusalMessage(undefined)).toBeNull();
  });

  it('names the permission problem before anything else', () => {
    expect(refusalMessage(new BillingRequestError(403, 'SUBSCRIPTION_EXISTS'))).toBe(
      'Only an owner can manage billing.',
    );
  });

  it('explains each billing refusal code', () => {
    expect(refusalMessage(new BillingRequestError(409, 'SUBSCRIPTION_EXISTS'))).toMatch(
      /already have a subscription/,
    );
    expect(refusalMessage(new BillingRequestError(409, 'NO_SUBSCRIPTION'))).toMatch(
      /do not have a billing account/,
    );
    expect(refusalMessage(new BillingRequestError(502, 'STRIPE_UNAVAILABLE'))).toMatch(
      /Could not reach Stripe/,
    );
  });

  it('falls back to a generic line for anything else', () => {
    expect(refusalMessage(new BillingRequestError(500, 'SOMETHING_NEW'))).toBe(
      'Something went wrong. Try again.',
    );
    expect(refusalMessage(new ApiError('boom', 500))).toBe('Something went wrong. Try again.');
  });
});
