import { type StripeClient, StripeSignatureError, type StripeWebhookEvent } from './stripe-client';

/**
 * Offline Stripe for local development and tests: deterministic ids and URLs, and a signature
 * check that accepts only the literal "fake" so the verification path is still exercised.
 */
export class FakeStripeClient implements StripeClient {
  createCustomer(input: { organizationId: string; email: string }): Promise<string> {
    return Promise.resolve(`cus_fake_${input.organizationId}`);
  }

  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    return Promise.resolve(`https://stripe.test/checkout/${input.organizationId}`);
  }

  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    return Promise.resolve(`https://stripe.test/portal/${input.customerId}`);
  }

  constructEvent(payload: Buffer, signature: string): StripeWebhookEvent {
    if (signature !== 'fake') {
      throw new StripeSignatureError('Invalid fake signature');
    }
    return JSON.parse(payload.toString('utf8')) as StripeWebhookEvent;
  }
}
