/** A Stripe event, narrowed to what the handlers read. */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  /** Stripe's own creation timestamp, in seconds. The ordering watermark. */
  created: number;
  data: { object: Record<string, unknown> };
}

/** Thrown when a webhook payload's signature does not verify. Never retry these. */
export class StripeSignatureError extends Error {}

export interface StripeClient {
  createCustomer(input: { organizationId: string; email: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  constructEvent(payload: Buffer, signature: string): StripeWebhookEvent;
}

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
