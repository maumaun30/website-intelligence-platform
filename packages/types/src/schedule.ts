import { SCAN_DEADLINE_MS } from './scan-jobs';
import type { ScanFrequency } from './website';

/** How long after one scheduled scan the next one is due. */
export const SCAN_INTERVAL_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;

export const SCAN_SCHEDULER_QUEUE = 'scan-scheduler';
export const SCHEDULER_JOB_ID = 'scan-scheduler-tick';
export const SCHEDULER_TICK_MS = 60 * 1000;
export const SCHEDULER_BATCH_SIZE = 50;

export function computeNextScanAt(frequency: ScanFrequency, from: Date): Date | null {
  return frequency === 'manual' ? null : new Date(from.getTime() + SCAN_INTERVAL_MS[frequency]);
}

export interface ActiveScanSnapshot {
  id: string;
  status: string;
  startedAt: Date | null;
}

/**
 * A `running` scan older than the worker's own deadline has lost its worker and must not block new
 * scans. A `queued` scan is never stale: it may be waiting behind other websites' crawls.
 */
export function isStaleScan(scan: ActiveScanSnapshot, now: Date): boolean {
  return (
    scan.status === 'running' &&
    scan.startedAt !== null &&
    now.getTime() - scan.startedAt.getTime() > SCAN_DEADLINE_MS
  );
}

export type ScanStartRefusal = 'WEBSITE_NOT_VERIFIED' | 'SCAN_IN_PROGRESS';

export type ScanStartDecision =
  { action: 'start'; staleScanId: string | null } | { action: 'refuse'; code: ScanStartRefusal };

/**
 * Whether a scan may start, shared by manual starts (API) and scheduled starts (worker) so the two
 * can never disagree. The caller performs the database work the decision implies.
 */
export function evaluateScanStart(input: {
  verificationStatus: string;
  activeScan: ActiveScanSnapshot | null;
  now: Date;
}): ScanStartDecision {
  if (input.verificationStatus !== 'verified') {
    return { action: 'refuse', code: 'WEBSITE_NOT_VERIFIED' };
  }
  if (input.activeScan === null) {
    return { action: 'start', staleScanId: null };
  }
  return isStaleScan(input.activeScan, input.now)
    ? { action: 'start', staleScanId: input.activeScan.id }
    : { action: 'refuse', code: 'SCAN_IN_PROGRESS' };
}
