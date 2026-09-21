import {
  type BillingState,
  type OrganizationPlan,
  type PlanChangeResult,
  billingStateSchema,
  planChangeResultSchema,
} from '@wintel/types';

import { ApiError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getBilling(): Promise<BillingState> {
  const response = await fetch(`${API_BASE_URL}/api/v1/billing`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(`Billing request failed (${response.status})`, response.status);
  }
  return billingStateSchema.parse(await response.json());
}

export async function changePlan(plan: OrganizationPlan): Promise<PlanChangeResult> {
  const response = await fetch(`${API_BASE_URL}/api/v1/billing/plan`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  if (!response.ok) {
    throw new ApiError(`Plan change failed (${response.status})`, response.status);
  }
  return planChangeResultSchema.parse(await response.json());
}
