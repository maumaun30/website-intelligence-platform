'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_EXPLANATION_STATUSES, type AuditRuleId, type Explanation } from '@wintel/types';

import { getExplanation, requestExplanation } from './explanations-client';

export const EXPLANATION_POLL_INTERVAL_MS = 2_000;

export function isActiveExplanation(explanation: Explanation | null | undefined): boolean {
  return (
    explanation !== null &&
    explanation !== undefined &&
    (ACTIVE_EXPLANATION_STATUSES as readonly string[]).includes(explanation.status)
  );
}

function explanationKey(scanId: string, ruleId: AuditRuleId) {
  return ['scans', scanId, 'explanations', ruleId] as const;
}

export function useExplanation(scanId: string, ruleId: AuditRuleId) {
  return useQuery({
    queryKey: explanationKey(scanId, ruleId),
    queryFn: () => getExplanation(scanId, ruleId),
    refetchInterval: (query) =>
      isActiveExplanation(query.state.data) ? EXPLANATION_POLL_INTERVAL_MS : false,
  });
}

export function useRequestExplanation(scanId: string, ruleId: AuditRuleId) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ regenerate }: { regenerate: boolean }) =>
      requestExplanation(scanId, { ruleId, regenerate }),
    onSuccess: (explanation) => client.setQueryData(explanationKey(scanId, ruleId), explanation),
  });
}
