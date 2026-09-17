'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_SCAN_STATUSES, type Scan } from '@wintel/types';

import { listScanPages, listScans, startScan } from './scans-client';

export const SCAN_POLL_INTERVAL_MS = 2_000;
export const SCAN_PAGE_SIZE = 50;

export function isActiveScan(scan: Scan | undefined): boolean {
  return scan !== undefined && (ACTIVE_SCAN_STATUSES as readonly string[]).includes(scan.status);
}

function scansKey(websiteId: string) {
  return ['websites', websiteId, 'scans'] as const;
}

/** Newest scan first. Polls only while that scan can still change. */
export function useScans(websiteId: string) {
  return useQuery({
    queryKey: scansKey(websiteId),
    queryFn: () => listScans(websiteId),
    refetchInterval: (query) =>
      isActiveScan(query.state.data?.[0]) ? SCAN_POLL_INTERVAL_MS : false,
  });
}

export function useStartScan(websiteId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => startScan(websiteId),
    onSuccess: () => client.invalidateQueries({ queryKey: scansKey(websiteId) }),
  });
}

/**
 * Pages of one scan. Keyed on the scan's `pagesCrawled` rather than polled on its own: `useScans`
 * already polls, and every progress change — including the final flush as the scan completes —
 * yields a new key and therefore a fresh read. The previous page stays on screen meanwhile.
 */
export function useScanPages(scanId: string, offset: number, pagesCrawled: number) {
  return useQuery({
    queryKey: ['scans', scanId, 'pages', offset, pagesCrawled],
    queryFn: () => listScanPages(scanId, { limit: SCAN_PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
}
