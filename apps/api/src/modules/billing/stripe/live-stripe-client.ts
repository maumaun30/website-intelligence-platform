import Stripe from 'stripe';

import { type StripeClient, StripeSignatureError, type StripeWebhookEvent } from './stripe-client';

/** The real Stripe. Hosted Checkout and Portal, so no card data ever reaches this process. */
export class LiveStripeClient implements StripeClient {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async createCustomer(input: { organizationId: string; email: string }): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      metadata: { organizationId: input.organizationId },
    });
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      // The webhook must attribute the session to an organization without trusting the browser.
      client_reference_id: input.organizationId,
      metadata: { organizationId: input.organizationId },
      subscription_data: { metadata: { organizationId: input.organizationId } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) {
      throw new Error('Stripe returned a checkout session with no URL');
    }
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  constructEvent(payload: Buffer, signature: string): StripeWebhookEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return event as unknown as StripeWebhookEvent;
    } catch (error) {
      throw new StripeSignatureError(
        error instanceof Error ? error.message : 'Invalid Stripe signature',
      );
    }
  }
}
