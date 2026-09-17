'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_AUDIT_STATUSES, type Audit, type AuditRuleId } from '@wintel/types';

import { getAudit, listIssues, rerunAudit } from './audits-client';

export const AUDIT_POLL_INTERVAL_MS = 2_000;
export const ISSUE_PAGE_SIZE = 20;

export function isActiveAudit(audit: Audit | null | undefined): boolean {
  return (
    audit !== null &&
    audit !== undefined &&
    (ACTIVE_AUDIT_STATUSES as readonly string[]).includes(audit.status)
  );
}

function auditKey(scanId: string) {
  return ['scans', scanId, 'audit'] as const;
}

export function useAudit(scanId: string) {
  return useQuery({
    queryKey: auditKey(scanId),
    queryFn: () => getAudit(scanId),
    refetchInterval: (query) => (isActiveAudit(query.state.data) ? AUDIT_POLL_INTERVAL_MS : false),
  });
}

export function useRerunAudit(scanId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => rerunAudit(scanId),
    onSuccess: () => client.invalidateQueries({ queryKey: auditKey(scanId) }),
  });
}

/** Affected pages for one rule. Keyed on the audit's `updatedAt` so a re-run shows fresh rows. */
export function useRuleIssues(
  scanId: string,
  ruleId: AuditRuleId,
  offset: number,
  auditUpdatedAt: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['scans', scanId, 'issues', ruleId, offset, auditUpdatedAt],
    queryFn: () => listIssues(scanId, { ruleId, limit: ISSUE_PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
