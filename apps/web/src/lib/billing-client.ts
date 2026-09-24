import {
  type BillingRedirect,
  type BillingState,
  type PurchasablePlan,
  billingRedirectSchema,
  billingStateSchema,
} from '@wintel/types';
import { z } from 'zod';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const errorBodySchema = z.object({ details: z.object({ code: z.string() }).optional() });

/** An API error that also carries the server's machine-readable `details.code`. */
export class BillingRequestError extends ApiError {
  constructor(
    status: number,
    readonly code: string | null,
  ) {
    super(`Billing request failed (${status})`, status);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/v1/billing${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
    throw new BillingRequestError(
      response.status,
      parsed.success ? (parsed.data.details?.code ?? null) : null,
    );
  }

  return response;
}

export async function getBilling(): Promise<BillingState> {
  const response = await request('');
  return billingStateSchema.parse(await response.json());
}

/** Sends the owner to hosted Stripe Checkout to buy `plan`. The plan itself arrives by webhook. */
export async function startCheckout(plan: PurchasablePlan): Promise<BillingRedirect> {
  const response = await request('/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
  return billingRedirectSchema.parse(await response.json());
}

/** Sends the owner to the hosted Billing Portal to manage an existing subscription. */
export async function openPortal(): Promise<BillingRedirect> {
  const response = await request('/portal', { method: 'POST' });
  return billingRedirectSchema.parse(await response.json());
}
