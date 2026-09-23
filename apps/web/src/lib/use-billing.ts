'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { BillingRedirect, PurchasablePlan } from '@wintel/types';

import type { ApiError } from './api-client';
import { getBilling, openPortal, startCheckout } from './billing-client';

export function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: () => getBilling() });
}

/** Checkout and portal both end in a full-page redirect to Stripe. */
export function useStartCheckout() {
  return useMutation<BillingRedirect, ApiError, PurchasablePlan>({
    mutationFn: (plan) => startCheckout(plan),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useOpenPortal() {
  return useMutation<BillingRedirect, ApiError, void>({
    mutationFn: () => openPortal(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}
