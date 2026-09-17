'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { IssueChangeKind } from '@wintel/types';

import { getOverview, getTrend, listChanges } from './insights-client';

export const CHANGE_PAGE_SIZE = 20;

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => getOverview() });
}

export function useTrend(websiteId: string) {
  return useQuery({
    queryKey: ['websites', websiteId, 'trend'],
    queryFn: () => getTrend(websiteId),
  });
}

/** Keyed on the audit's `updatedAt` so a re-run shows its own changes. */
export function useChanges(
  scanId: string,
  kind: IssueChangeKind,
  offset: number,
  auditUpdatedAt: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['scans', scanId, 'changes', kind, offset, auditUpdatedAt],
    queryFn: () => listChanges(scanId, { kind, limit: CHANGE_PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
