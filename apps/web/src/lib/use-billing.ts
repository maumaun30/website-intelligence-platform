'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganizationPlan } from '@wintel/types';

import { changePlan, getBilling } from './billing-client';

export function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: () => getBilling() });
}

/** A plan change can reset schedules, so websites and the overview are refetched with it. */
export function useChangePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (plan: OrganizationPlan) => changePlan(plan),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing'] }),
        queryClient.invalidateQueries({ queryKey: ['websites'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ]);
    },
  });
}
