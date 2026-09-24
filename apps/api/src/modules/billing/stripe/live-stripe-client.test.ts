import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { LiveStripeClient } from './live-stripe-client';
import { StripeSignatureError } from './stripe-client';

const secret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_dummy');
const client = new LiveStripeClient(stripe, secret);

const payload = JSON.stringify({
  id: 'evt_signed',
  type: 'customer.subscription.updated',
  created: 1_700_000_000,
  data: { object: { customer: 'cus_1' } },
});

describe('LiveStripeClient.constructEvent', () => {
  it('accepts a payload Stripe signed', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    expect(client.constructEvent(Buffer.from(payload), header).id).toBe('evt_signed');
  });

  it('rejects a tampered payload', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    expect(() => client.constructEvent(Buffer.from(`${payload} `), header)).toThrow(
      StripeSignatureError,
    );
  });
});
